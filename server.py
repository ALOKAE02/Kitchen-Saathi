#!/usr/bin/env python3
"""Kitchen Saathi server: the app's static files, Google sign-in and per-account kitchen storage.

Standard library only, so there is nothing to install.

    python server.py            then open http://localhost:5173

Settings come from environment variables or a `.env` file next to this script:
    GOOGLE_CLIENT_ID   OAuth "Web application" client ID from Google Cloud Console
    PORT               default 5173
    HOST               default 127.0.0.1 (this machine only)
    DATA_DIR           where the SQLite database lives, default ./data
    SECURE_COOKIES     set to 1 when the app is served over HTTPS

Sign-in flow: Google's button gives the browser an ID token (a signed JWT). The browser posts it
to /api/auth/google; we check the RS256 signature against Google's published keys, then the
issuer, audience and expiry, and only then start a session (random token in an HttpOnly cookie,
stored hashed in the database).
"""
import base64
import contextlib
import hashlib
import hmac
import http.server
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

APP_DIR = Path(__file__).resolve().parent


def load_env_file(path):
    """Minimal KEY=VALUE .env reader. Real environment variables win."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(APP_DIR / ".env")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "5173"))
DATA_DIR = Path(os.environ.get("DATA_DIR", APP_DIR / "data"))
SECURE_COOKIES = os.environ.get("SECURE_COOKIES", "") == "1"

SESSION_COOKIE = "ks_session"
SESSION_SECONDS = 30 * 24 * 3600
MAX_BODY = 1_000_000
CLOCK_SKEW = 60

GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"

# What the browser may load. Matches Google's published CSP guidance for Identity Services.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
    "frame-src https://accounts.google.com/gsi/",
    "connect-src 'self' https://accounts.google.com/gsi/",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://*.googleusercontent.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
])

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}
STATIC_DIRS = ("css", "js")


# ---------------------------------------------------------------- Google ID token verification

class TokenError(Exception):
    pass


def b64url_decode(data):
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


# DER prefix of a SHA-256 DigestInfo, from RFC 8017 section 9.2.
SHA256_DIGEST_INFO = bytes.fromhex("3031300d060960864801650304020105000420")


def rsa_pkcs1_sha256_verify(n, e, message, signature):
    """RSASSA-PKCS1-v1_5 verification. Rebuilds the full expected encoding and compares it
    byte for byte, so loose-parsing signature forgeries do not apply."""
    k = (n.bit_length() + 7) // 8
    if k < 256 or len(signature) != k:  # Google's keys are 2048-bit; refuse anything weaker
        return False
    s = int.from_bytes(signature, "big")
    if s >= n:
        return False
    em = pow(s, e, n).to_bytes(k, "big")
    t = SHA256_DIGEST_INFO + hashlib.sha256(message).digest()
    expected = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    return hmac.compare_digest(em, expected)


class GoogleKeys:
    """Google's current signing keys, cached for as long as Google's Cache-Control allows."""

    def __init__(self, url=GOOGLE_CERTS_URL):
        self.url = url
        self.keys = {}
        self.expires = 0.0
        self.last_fetch = 0.0
        self.lock = threading.Lock()

    def get(self, kid):
        with self.lock:
            now = time.time()
            stale = now > self.expires
            # An unknown kid may mean Google rotated keys; refetch, but at most once a minute.
            unknown = kid not in self.keys and now - self.last_fetch > 60
            if stale or unknown:
                self._refresh()
            return self.keys.get(kid)

    def _refresh(self):
        self.last_fetch = time.time()
        with urllib.request.urlopen(self.url, timeout=5) as resp:
            data = json.load(resp)
            match = re.search(r"max-age=(\d+)", resp.headers.get("Cache-Control", ""))
        self.keys = {
            k["kid"]: (int.from_bytes(b64url_decode(k["n"]), "big"), int.from_bytes(b64url_decode(k["e"]), "big"))
            for k in data.get("keys", []) if k.get("kty") == "RSA" and k.get("kid")
        }
        self.expires = time.time() + (int(match.group(1)) if match else 3600)


def verify_google_id_token(token, client_id, keys, now=None):
    """Return the token's claims if it is a valid Google ID token for `client_id`, else raise."""
    if not client_id:
        raise TokenError("server has no GOOGLE_CLIENT_ID")
    parts = token.split(".") if isinstance(token, str) else []
    if len(parts) != 3:
        raise TokenError("malformed token")
    try:
        header = json.loads(b64url_decode(parts[0]))
        claims = json.loads(b64url_decode(parts[1]))
        signature = b64url_decode(parts[2])
    except (ValueError, json.JSONDecodeError):
        raise TokenError("malformed token")
    if header.get("alg") != "RS256":
        raise TokenError("unexpected algorithm")
    key = keys.get(header.get("kid"))
    if not key:
        raise TokenError("unknown signing key")
    if not rsa_pkcs1_sha256_verify(key[0], key[1], (parts[0] + "." + parts[1]).encode("ascii"), signature):
        raise TokenError("bad signature")

    now = time.time() if now is None else now
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise TokenError("wrong issuer")
    aud = claims.get("aud")
    if aud != client_id and not (isinstance(aud, list) and client_id in aud):
        raise TokenError("token is for another app")
    if not isinstance(claims.get("exp"), (int, float)) or claims["exp"] < now - CLOCK_SKEW:
        raise TokenError("token expired")
    if isinstance(claims.get("iat"), (int, float)) and claims["iat"] > now + CLOCK_SKEW:
        raise TokenError("token issued in the future")
    if not claims.get("sub"):
        raise TokenError("no subject")
    return claims


# ---------------------------------------------------------------- storage

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,            -- Google 'sub'
  email TEXT, name TEXT, given_name TEXT, picture TEXT,
  created_at INTEGER NOT NULL, last_login INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,    -- sha256 of the cookie value; the raw token is never stored
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS kitchens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL, updated_at INTEGER NOT NULL
);
"""


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as c:
            c.executescript(SCHEMA)

    @contextlib.contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    @staticmethod
    def hash_token(token):
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def upsert_user(self, claims):
        now = int(time.time())
        with self.connect() as c:
            c.execute(
                """INSERT INTO users (id, email, name, given_name, picture, created_at, last_login)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name,
                     given_name = excluded.given_name, picture = excluded.picture, last_login = excluded.last_login""",
                (claims["sub"], claims.get("email", ""), claims.get("name", ""), claims.get("given_name", ""),
                 claims.get("picture", ""), now, now))
        return self.user(claims["sub"])

    def user(self, user_id):
        with self.connect() as c:
            row = c.execute("SELECT id, email, name, given_name, picture FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def create_session(self, user_id):
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        with self.connect() as c:
            c.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            c.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                      (self.hash_token(token), user_id, now, now + SESSION_SECONDS))
        return token

    def session_user(self, token):
        if not token:
            return None
        with self.connect() as c:
            row = c.execute(
                """SELECT u.id, u.email, u.name, u.given_name, u.picture FROM sessions s
                   JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?""",
                (self.hash_token(token), int(time.time()))).fetchone()
        return dict(row) if row else None

    def end_session(self, token):
        if token:
            with self.connect() as c:
                c.execute("DELETE FROM sessions WHERE token_hash = ?", (self.hash_token(token),))

    def kitchen(self, user_id):
        with self.connect() as c:
            row = c.execute("SELECT state, updated_at FROM kitchens WHERE user_id = ?", (user_id,)).fetchone()
        return (json.loads(row["state"]), row["updated_at"]) if row else (None, None)

    def save_kitchen(self, user_id, state):
        now = int(time.time() * 1000)
        with self.connect() as c:
            c.execute(
                """INSERT INTO kitchens (user_id, state, updated_at) VALUES (?, ?, ?)
                   ON CONFLICT(user_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at""",
                (user_id, json.dumps(state, separators=(",", ":")), now))
        return now


# ---------------------------------------------------------------- HTTP

def public_user(row):
    return {"id": "g-" + row["id"], "name": row["given_name"] or row["name"] or row["email"],
            "fullName": row["name"], "email": row["email"], "picture": row["picture"]}


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "KitchenSaathi"
    sys_version = ""
    store = None        # set in main()
    google_keys = None  # set in main()

    # ---- plumbing
    def security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        # Google's sign-in popup needs to talk back to this window.
        self.send_header("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        self.send_header("Content-Security-Policy", CSP)

    def send_json(self, status, payload, cookie=None):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.security_headers()
        self.end_headers()
        self.wfile.write(body)

    def session_token(self):
        # Parsed by hand: SimpleCookie stops at the first value it dislikes, and Google's own
        # g_state cookie (JSON with quotes and commas) would hide ours whenever it comes first.
        for part in self.headers.get("Cookie", "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == SESSION_COOKIE and value:
                return value
        return None

    def session_cookie(self, token, max_age):
        parts = [SESSION_COOKIE + "=" + token, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=" + str(max_age)]
        if SECURE_COOKIES:
            parts.append("Secure")
        return "; ".join(parts)

    def read_json(self):
        """Body of a state-changing request, only from this origin and only as JSON (CSRF guard)."""
        origin = self.headers.get("Origin")
        if not origin or urlsplit(origin).netloc != self.headers.get("Host"):
            raise PermissionError("cross-origin request refused")
        if not self.headers.get("Content-Type", "").startswith("application/json"):
            raise ValueError("expected JSON")
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            raise ValueError("body missing or too large")
        return json.loads(self.rfile.read(length))

    def log_message(self, fmt, *args):
        sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))

    # ---- routing
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/config":
            return self.send_json(200, {"googleClientId": GOOGLE_CLIENT_ID})
        if path == "/api/me":
            # 200 either way: being signed out is a normal answer here, not an error.
            user = self.store.session_user(self.session_token())
            return self.send_json(200, {"user": public_user(user) if user else None})
        if path == "/api/kitchen":
            user = self.store.session_user(self.session_token())
            if not user:
                return self.send_json(401, {"error": "signed_out"})
            state, updated = self.store.kitchen(user["id"])
            return self.send_json(200, {"state": state, "updatedAt": updated})
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "not_found"})
        return self.serve_static(path)

    def do_HEAD(self):
        self.send_error(405)

    def do_POST(self):
        path = urlsplit(self.path).path
        try:
            body = self.read_json()
        except PermissionError as e:
            return self.send_json(403, {"error": str(e)})
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json(400, {"error": str(e)})

        if path == "/api/auth/google":
            try:
                claims = verify_google_id_token(body.get("credential"), GOOGLE_CLIENT_ID, self.google_keys)
            except TokenError as e:
                return self.send_json(401, {"error": "sign_in_failed", "detail": str(e)})
            except OSError:
                return self.send_json(503, {"error": "google_unreachable"})
            self.store.end_session(self.session_token())  # never reuse a pre-login session
            user = self.store.upsert_user(claims)
            token = self.store.create_session(user["id"])
            return self.send_json(200, {"user": public_user(user)}, cookie=self.session_cookie(token, SESSION_SECONDS))
        if path == "/api/auth/logout":
            self.store.end_session(self.session_token())
            return self.send_json(200, {"ok": True}, cookie=self.session_cookie("", 0))
        return self.send_json(404, {"error": "not_found"})

    def do_PUT(self):
        if urlsplit(self.path).path != "/api/kitchen":
            return self.send_json(404, {"error": "not_found"})
        try:
            body = self.read_json()
        except PermissionError as e:
            return self.send_json(403, {"error": str(e)})
        except (ValueError, json.JSONDecodeError) as e:
            return self.send_json(400, {"error": str(e)})
        user = self.store.session_user(self.session_token())
        if not user:
            return self.send_json(401, {"error": "signed_out"})
        state = body.get("state") if isinstance(body, dict) else None
        if not isinstance(state, dict):
            return self.send_json(400, {"error": "state must be an object"})
        updated = self.store.save_kitchen(user["id"], state)
        return self.send_json(200, {"updatedAt": updated})

    def serve_static(self, path):
        # Only index.html and files under css/ and js/ are public; nothing else in this folder is.
        rel = "index.html" if path in ("/", "/index.html") else path.lstrip("/")
        target = (APP_DIR / rel).resolve()
        allowed = rel == "index.html" or any(target.is_relative_to(APP_DIR / d) for d in STATIC_DIRS)
        if not allowed or not target.is_file() or target.suffix not in MIME:
            return self.send_json(404, {"error": "not_found"})
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", MIME[target.suffix])
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.security_headers()
        self.end_headers()
        self.wfile.write(data)


def main():
    Handler.store = Store(DATA_DIR / "kitchen_saathi.db")
    Handler.google_keys = GoogleKeys()
    try:
        httpd = http.server.ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as e:
        sys.exit("Could not listen on %s:%d (%s). Is something else using the port? Set PORT to change it." % (HOST, PORT, e))
    print("Kitchen Saathi running at http://localhost:%d" % PORT, flush=True)
    if GOOGLE_CLIENT_ID:
        print("Google sign-in: on (client %s…)" % GOOGLE_CLIENT_ID[:12], flush=True)
    else:
        print("Google sign-in: off. Put GOOGLE_CLIENT_ID=... in .env and restart. The demo works without it.", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
