/* Demo data for an India mess kitchen. Every number here is sample data and editable in the app.
   Rates are per cover (one person, one serving) in the ingredient's base unit:
   kg, L, pc (pieces) or bunch. */
KS.seed = (function () {
  // unit: base unit the recipe uses. shelf: [fresh up to N days, use soon up to M days, then stale].
  // buyStep: how it is usually bought, used to round the draft up.
  const ingredients = {
    toorDal:   { en: 'Toor dal', hi: 'अरहर (तूर) दाल', unit: 'kg', shelf: [90, 180], buyStep: 1 },
    rice:      { en: 'Rice (basmati, broken)', hi: 'चावल (टुकड़ा बासमती)', unit: 'kg', shelf: [120, 240], buyStep: 1 },
    atta:      { en: 'Atta', hi: 'आटा', unit: 'kg', shelf: [30, 60], buyStep: 1 },
    poha:      { en: 'Poha (thick)', hi: 'पोहा (मोटा)', unit: 'kg', shelf: [60, 120], buyStep: 1 },
    onion:     { en: 'Onion', hi: 'प्याज़', unit: 'kg', shelf: [10, 20], buyStep: 0.5 },
    tomato:    { en: 'Tomato', hi: 'टमाटर', unit: 'kg', shelf: [2, 4], buyStep: 0.5 },
    potato:    { en: 'Potato', hi: 'आलू', unit: 'kg', shelf: [14, 30], buyStep: 0.5 },
    gobhi:     { en: 'Cauliflower', hi: 'फूलगोभी', unit: 'kg', shelf: [2, 4], buyStep: 0.5 },
    mixVeg:    { en: 'Sambar vegetables', hi: 'सांभर की सब्ज़ी', unit: 'kg', shelf: [2, 4], buyStep: 0.5 },
    greenChilli: { en: 'Green chilli', hi: 'हरी मिर्च', unit: 'kg', shelf: [3, 6], buyStep: 0.1 },
    garlic:    { en: 'Garlic', hi: 'लहसुन', unit: 'kg', shelf: [20, 40], buyStep: 0.25 },
    coriander: { en: 'Coriander leaves', hi: 'हरा धनिया', unit: 'bunch', shelf: [1, 2], buyStep: 1 },
    lemon:     { en: 'Lemon', hi: 'नींबू', unit: 'pc', shelf: [7, 14], buyStep: 1 },
    paneer:    { en: 'Paneer', hi: 'पनीर', unit: 'kg', shelf: [1, 2], buyStep: 0.25 },
    butter:    { en: 'Butter', hi: 'मक्खन', unit: 'kg', shelf: [14, 30], buyStep: 0.5 },
    cream:     { en: 'Fresh cream', hi: 'मलाई / क्रीम', unit: 'L', shelf: [1, 3], buyStep: 0.25 },
    ghee:      { en: 'Ghee', hi: 'घी', unit: 'kg', shelf: [90, 180], buyStep: 0.5 },
    oil:       { en: 'Refined oil', hi: 'रिफ़ाइंड तेल', unit: 'L', shelf: [90, 180], buyStep: 1 },
    jeera:     { en: 'Jeera (cumin)', hi: 'जीरा', unit: 'kg', shelf: [180, 365], buyStep: 0.1 },
    haldi:     { en: 'Haldi (turmeric)', hi: 'हल्दी', unit: 'kg', shelf: [180, 365], buyStep: 0.1 },
    salt:      { en: 'Salt', hi: 'नमक', unit: 'kg', shelf: [365, 730], buyStep: 1 },
    sugar:     { en: 'Sugar', hi: 'चीनी', unit: 'kg', shelf: [365, 730], buyStep: 1 },
    peanuts:   { en: 'Peanuts', hi: 'मूँगफली', unit: 'kg', shelf: [60, 120], buyStep: 0.5 },
    cashew:    { en: 'Cashew', hi: 'काजू', unit: 'kg', shelf: [60, 120], buyStep: 0.1 },
    garamMasala: { en: 'Garam masala', hi: 'गरम मसाला', unit: 'kg', shelf: [120, 240], buyStep: 0.1 },
    sambarMasala: { en: 'Sambar masala', hi: 'सांभर मसाला', unit: 'kg', shelf: [120, 240], buyStep: 0.1 },
    tamarind:  { en: 'Tamarind', hi: 'इमली', unit: 'kg', shelf: [120, 240], buyStep: 0.1 },
  };

  const dishes = {
    dalTadka: {
      en: 'Dal tadka', hi: 'दाल तड़का', meals: ['lunch', 'dinner'],
      recipe: { toorDal: 0.05, onion: 0.015, tomato: 0.02, garlic: 0.003, greenChilli: 0.002, jeera: 0.001, haldi: 0.0005, ghee: 0.004, salt: 0.002 },
    },
    jeeraRice: {
      en: 'Jeera rice', hi: 'जीरा राइस', meals: ['lunch', 'dinner'],
      recipe: { rice: 0.09, jeera: 0.0015, oil: 0.005, salt: 0.0015 },
    },
    roti: {
      en: 'Roti', hi: 'रोटी', meals: ['lunch', 'dinner'],
      recipe: { atta: 0.1, oil: 0.002, salt: 0.0005 },
    },
    alooGobhi: {
      en: 'Aloo gobhi', hi: 'आलू गोभी', meals: ['lunch', 'dinner'],
      recipe: { potato: 0.07, gobhi: 0.08, onion: 0.02, tomato: 0.02, greenChilli: 0.002, jeera: 0.001, haldi: 0.0005, oil: 0.008, coriander: 0.05, salt: 0.002 },
    },
    paneerButter: {
      en: 'Paneer butter masala', hi: 'पनीर बटर मसाला', meals: ['dinner', 'lunch'],
      recipe: { paneer: 0.08, tomato: 0.06, onion: 0.03, butter: 0.008, cream: 0.01, cashew: 0.005, garamMasala: 0.001, salt: 0.002 },
    },
    poha: {
      en: 'Poha', hi: 'पोहा', meals: ['breakfast'],
      recipe: { poha: 0.07, onion: 0.02, potato: 0.02, peanuts: 0.01, greenChilli: 0.002, haldi: 0.0005, oil: 0.006, lemon: 0.25, sugar: 0.002, coriander: 0.03, salt: 0.0015 },
    },
    sambar: {
      en: 'Sambar', hi: 'सांभर', meals: ['lunch', 'dinner', 'breakfast'],
      recipe: { toorDal: 0.03, mixVeg: 0.06, tomato: 0.02, onion: 0.015, tamarind: 0.004, sambarMasala: 0.003, oil: 0.004, salt: 0.002 },
    },
  };

  // Stock register. daysAgo becomes a real date when the demo is created.
  // A few are deliberately messy: jeera written in grams, oil written in kg.
  const stock = [
    { ing: 'toorDal', qty: 6, unit: 'kg', daysAgo: 20 },
    { ing: 'rice', qty: 25, unit: 'kg', daysAgo: 30 },
    { ing: 'atta', qty: 18, unit: 'kg', daysAgo: 9 },
    { ing: 'poha', qty: 3, unit: 'kg', daysAgo: 12 },
    { ing: 'onion', qty: 7, unit: 'kg', daysAgo: 12 },
    { ing: 'tomato', qty: 3, unit: 'kg', daysAgo: 3 },
    { ing: 'potato', qty: 10, unit: 'kg', daysAgo: 6 },
    { ing: 'gobhi', qty: 2, unit: 'kg', daysAgo: 5 },
    { ing: 'greenChilli', qty: 0.3, unit: 'kg', daysAgo: 4 },
    { ing: 'garlic', qty: 0.5, unit: 'kg', daysAgo: 8 },
    { ing: 'coriander', qty: 4, unit: 'bunch', daysAgo: 1 },
    { ing: 'lemon', qty: 10, unit: 'pc', daysAgo: 3 },
    { ing: 'paneer', qty: 1.5, unit: 'kg', daysAgo: 3 },
    { ing: 'butter', qty: 0.5, unit: 'kg', daysAgo: 7 },
    { ing: 'cream', qty: 0.4, unit: 'L', daysAgo: 2 },
    { ing: 'ghee', qty: 2, unit: 'kg', daysAgo: 25 },
    { ing: 'oil', qty: 6, unit: 'kg', daysAgo: 15 },
    { ing: 'jeera', qty: 800, unit: 'g', daysAgo: 40 },
    { ing: 'haldi', qty: 0.5, unit: 'kg', daysAgo: 40 },
    { ing: 'salt', qty: 5, unit: 'kg', daysAgo: 40 },
    { ing: 'peanuts', qty: 1, unit: 'kg', daysAgo: 18 },
  ];

  function build(today) {
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const ds = clone(dishes);
    const st = {};
    stock.forEach((s) => {
      st[s.ing] = { qty: s.qty, unit: s.unit, recordedOn: KS.date.add(today, -s.daysAgo), countStale: false };
    });
    const breakfastId = 'p-' + today + '-breakfast';
    return {
      version: 1,
      lang: 'en',
      role: 'manager',
      kitchen: { name: 'Sunrise Boys Hostel, Sector 51, Gurugram', usualCovers: 80, onboarded: false },
      ingredients: clone(ingredients),
      dishes: ds,
      stock: st,
      plans: {
        [breakfastId]: {
          id: breakfastId, date: today, meal: 'breakfast', dishes: ['poha'], covers: 70,
          status: 'ordered', sharedAt: today + 'T06:10:00', draft: null, createdAt: Date.now(),
        },
      },
      recent: ['poha', 'dalTadka', 'jeeraRice', 'roti'],
      alerts: [],
    };
  }

  return { build };
})();
