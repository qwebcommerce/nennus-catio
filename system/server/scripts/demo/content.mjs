/**
 * Demo content for a Qatar pet shop (scripts/demo-data.mjs). Every customer-facing name has an
 * Arabic and an English version. Money is in riyals as strings (the API converts to dirhams).
 * Customers, staff and suppliers are clearly fictional: e-mails at example.com and phone numbers
 * in the +974 5000 0xxx range.
 */

export const CATEGORIES = [
  { key: "catFood", name: "طعام القطط", nameEn: "Cat food" },
  { key: "dogFood", name: "طعام الكلاب", nameEn: "Dog food" },
  { key: "small", name: "الطيور والحيوانات الصغيرة", nameEn: "Bird & small pets" },
  { key: "litter", name: "الرمل والنظافة", nameEn: "Litter & hygiene" },
  { key: "toys", name: "الألعاب والإكسسوارات", nameEn: "Toys & accessories" },
  { key: "houses", name: "بيوت الحيوانات", nameEn: "Pet houses" },
];

export const PET_TYPES = [
  { key: "cats", name: "قطط", nameEn: "Cats" },
  { key: "dogs", name: "كلاب", nameEn: "Dogs" },
  { key: "birds", name: "طيور", nameEn: "Birds" },
  { key: "small", name: "حيوانات صغيرة", nameEn: "Small pets" },
  { key: "fish", name: "أسماك", nameEn: "Fish" },
  { key: "reptiles", name: "زواحف", nameEn: "Reptiles" },
];

export const LOCATIONS = {
  warehouse: { name: "المستودع الرئيسي – الصناعية", nameEn: "Main warehouse – Industrial Area", kind: "WAREHOUSE", address: "Street 24, Industrial Area, Doha" },
  shop: { name: "متجر نينوس كاتيو – الوعب", nameEn: "Nennus Catio shop – Al Waab", kind: "SHOP", address: "Al Waab Street, Doha" },
  van1: { name: "سيارة البيع 1", nameEn: "Sales van 1", kind: "VAN", address: null },
  van2: { name: "سيارة البيع 2", nameEn: "Sales van 2", kind: "VAN", address: null },
};

export const VEHICLES = [
  { van: "van1", name: "Toyota Hiace – Van 1", plate: "DEMO 41027" },
  { van: "van2", name: "Nissan Urvan – Van 2", plate: "DEMO 58314" },
];

/** Staff accounts get a random password nobody knows (never printed or stored anywhere). */
export const STAFF = [
  { key: "cashier", name: "مريم الحمادي", nameEn: "Mariam Al Hammadi", email: "demo.cashier@example.com", role: "SALES", location: "shop" },
  { key: "van1", name: "راجيش كومار", nameEn: "Rajesh Kumar", email: "demo.van1@example.com", role: "DRIVER", location: "van1" },
  { key: "van2", name: "جوزيف سانتوس", nameEn: "Joseph Santos", email: "demo.van2@example.com", role: "DRIVER", location: "van2" },
  // fix-ra: the new roles (business-wide, no fixed location).
  { key: "accountant", name: "فاطمة النعيمي", nameEn: "Fatima Al Nuaimi", email: "demo.accountant@example.com", role: "ACCOUNTANT", location: null },
  { key: "b2b", name: "عمر الشمري", nameEn: "Omar Al Shammari", email: "demo.b2b@example.com", role: "B2B", location: null },
  { key: "supervisor", name: "ليلى حسن", nameEn: "Laila Hassan", email: "demo.supervisor@example.com", role: "SUPERVISOR", location: "shop" },
];

export const SUPPLIERS = [
  { key: "gulfPet", name: "Gulf Pet Supplies W.L.L.", phone: "+974 4000 0101", email: "orders.gulfpet@example.com", address: "Street 33, Industrial Area, Doha", note: "Pet food distributor – 30 days credit" },
  { key: "doha", name: "Doha Animal Care Trading", phone: "+974 4000 0102", email: "sales.dohacare@example.com", address: "Salwa Road, Doha", note: "Litter, hygiene and accessories" },
  { key: "woodcraft", name: "Al Wakrah Woodcraft Workshop", phone: "+974 4000 0103", email: "workshop.wakrah@example.com", address: "Al Wakrah", note: "Builds our pet houses" },
];

const IMG = {
  cat: "/images/cat-care.png",
  dog: "/images/pets-hero.png",
  bird: "/images/bird.png",
  essentials: "/images/essentials.png",
  grooming: "/images/grooming.png",
};

/**
 * Products. price/cost in riyals (cost = what we pay the supplier). `variants` are pack sizes.
 * sellBy WEIGHT products are priced per kg and their stock is in grams.
 * `supplier` is who we buy from; `pets` the pet types; `stockPlan` how many we buy at the start.
 */
export const PRODUCTS = [
  {
    key: "kittenDry", cat: "catFood", pets: ["cats"], supplier: "gulfPet", image: IMG.cat,
    name: "طعام جاف للقطط الصغيرة – دجاج وأرز", nameEn: "Kitten Dry Food – Chicken & Rice",
    descriptionEn: "Complete dry food for kittens up to 12 months, with chicken as the first ingredient.",
    description: "طعام جاف متكامل للقطط حتى عمر 12 شهراً، والدجاج هو المكوّن الأول.",
    price: "29.00", cost: "17.50",
    variants: [
      { label: "400 غ", labelEn: "400 g", price: "29.00", cost: "17.50", buy: 40 },
      { label: "2 كغ", labelEn: "2 kg", price: "98.00", cost: "61.00", buy: 24 },
      { label: "4 كغ", labelEn: "4 kg", price: "179.00", cost: "112.00", buy: 12 },
    ],
  },
  {
    key: "adultCat", cat: "catFood", pets: ["cats"], supplier: "gulfPet", image: IMG.cat,
    name: "طعام جاف للقطط البالغة – سلمون", nameEn: "Adult Cat Dry Food – Salmon",
    descriptionEn: "Salmon recipe for adult cats, supports healthy skin and a shiny coat.",
    description: "وصفة السلمون للقطط البالغة، تدعم صحة الجلد ولمعان الفرو.",
    price: "62.00", cost: "38.00",
    variants: [
      { label: "1.5 كغ", labelEn: "1.5 kg", price: "62.00", cost: "38.00", buy: 30 },
      { label: "4 كغ", labelEn: "4 kg", price: "145.00", cost: "91.00", buy: 18 },
      { label: "10 كغ", labelEn: "10 kg", price: "315.00", cost: "205.00", buy: 6 },
    ],
  },
  {
    key: "wetPouch", cat: "catFood", pets: ["cats"], supplier: "gulfPet", image: IMG.cat,
    name: "طعام رطب للقطط – تونة بالجيلي 85 غ", nameEn: "Wet Cat Food Pouch – Tuna in Jelly 85 g",
    descriptionEn: "Tender tuna pieces in jelly. Buy 2, get 1 free this month.",
    description: "قطع تونة طرية بالجيلي. اشترِ 2 واحصل على 1 مجاناً هذا الشهر.",
    price: "4.50", cost: "2.40", buy: 240,
  },
  {
    key: "catTreats", cat: "catFood", pets: ["cats"], supplier: "gulfPet", image: IMG.cat,
    name: "مكافآت كريمية للقطط – دجاج (5 × 15 غ)", nameEn: "Creamy Cat Treats – Chicken (5 × 15 g)",
    descriptionEn: "Lickable creamy treats, five sticks per pack.",
    description: "مكافآت كريمية سهلة اللعق، خمس أعواد في العبوة.",
    price: "14.00", cost: "7.80", buy: 60,
  },
  {
    key: "looseCat", cat: "catFood", pets: ["cats"], supplier: "gulfPet", image: IMG.cat, sellBy: "WEIGHT",
    name: "طعام قطط بالوزن – خالٍ من الحبوب", nameEn: "Grain-free Cat Kibble (by weight)",
    descriptionEn: "Weighed at the counter. Price per kg.",
    description: "يوزن عند الكاشير. السعر لكل كيلوغرام.",
    price: "38.00", cost: "22.00", openingGrams: 30000,
  },
  {
    key: "adultDog", cat: "dogFood", pets: ["dogs"], supplier: "gulfPet", image: IMG.dog,
    name: "طعام جاف للكلاب البالغة – لحم ضأن وأرز", nameEn: "Adult Dog Dry Food – Lamb & Rice",
    descriptionEn: "Lamb and rice for adult dogs of all breeds.",
    description: "لحم ضأن وأرز للكلاب البالغة من جميع السلالات.",
    price: "89.00", cost: "56.00",
    variants: [
      { label: "3 كغ", labelEn: "3 kg", price: "89.00", cost: "56.00", buy: 20 },
      { label: "12 كغ", labelEn: "12 kg", price: "289.00", cost: "188.00", buy: 8 },
    ],
  },
  {
    key: "puppyDry", cat: "dogFood", pets: ["dogs"], supplier: "gulfPet", image: IMG.dog,
    name: "طعام جاف للجراء – دجاج 2.5 كغ", nameEn: "Puppy Dry Food – Chicken 2.5 kg",
    descriptionEn: "Small kibble for puppies, with DHA.",
    description: "حبيبات صغيرة للجراء مع DHA.",
    price: "79.00", cost: "49.00", buy: 16,
  },
  {
    key: "wetDog", cat: "dogFood", pets: ["dogs"], supplier: "gulfPet", image: IMG.dog,
    name: "طعام رطب للكلاب – لحم بقري 400 غ", nameEn: "Wet Dog Food Can – Beef 400 g",
    descriptionEn: "Chunks of beef in gravy.",
    description: "قطع لحم بقري بالمرق.",
    price: "9.50", cost: "5.20", buy: 96,
  },
  {
    key: "dentalChews", cat: "dogFood", pets: ["dogs"], supplier: "doha", image: IMG.dog,
    name: "أعواد العناية بالأسنان للكلاب (7 قطع)", nameEn: "Dental Chews for Dogs (7 pcs)",
    descriptionEn: "One chew a day for cleaner teeth and fresher breath.",
    description: "قطعة يومياً لأسنان أنظف ونفَس منعش.",
    price: "32.00", cost: "18.50", buy: 30,
  },
  {
    key: "looseDog", cat: "dogFood", pets: ["dogs"], supplier: "gulfPet", image: IMG.dog, sellBy: "WEIGHT",
    name: "بسكويت كلاب بالوزن", nameEn: "Dog Biscuits (by weight)",
    descriptionEn: "Crunchy oven-baked biscuits. Price per kg.",
    description: "بسكويت مخبوز مقرمش. السعر لكل كيلوغرام.",
    price: "26.00", cost: "14.00", openingGrams: 20000,
  },
  {
    key: "budgieSeed", cat: "small", pets: ["birds"], supplier: "doha", image: IMG.bird,
    name: "خليط بذور طيور البادجي 1 كغ", nameEn: "Budgie Seed Mix 1 kg",
    descriptionEn: "Millet, canary seed and oats for budgies and small parakeets.",
    description: "دخن وبذور كناري وشوفان لطيور البادجي والببغاوات الصغيرة.",
    price: "18.00", cost: "9.50", buy: 30,
  },
  {
    key: "parrotMix", cat: "small", pets: ["birds"], supplier: "doha", image: IMG.bird,
    name: "طعام الببغاء – فواكه ومكسرات 2 كغ", nameEn: "Parrot Food – Fruit & Nut Mix 2 kg",
    descriptionEn: "Sunflower seeds, dried fruit and nuts for medium and large parrots.",
    description: "بذور دوار الشمس وفواكه مجففة ومكسرات للببغاوات المتوسطة والكبيرة.",
    price: "59.00", cost: "34.00", buy: 12,
  },
  {
    key: "timothyHay", cat: "small", pets: ["small"], supplier: "doha", image: IMG.bird,
    name: "تبن تيموثي للأرانب 1 كغ", nameEn: "Timothy Hay for Rabbits 1 kg",
    descriptionEn: "Sun-dried timothy hay, high in fibre.",
    description: "تبن تيموثي مجفف بالشمس، غني بالألياف.",
    price: "24.00", cost: "12.50", buy: 24,
  },
  {
    key: "hamsterMix", cat: "small", pets: ["small"], supplier: "doha", image: IMG.bird,
    name: "طعام الهامستر 500 غ", nameEn: "Hamster Food Mix 500 g",
    descriptionEn: "Seeds, grains and dried vegetables for hamsters and gerbils.",
    description: "بذور وحبوب وخضار مجففة للهامستر والجربوع.",
    price: "16.50", cost: "8.50", buy: 20,
  },
  {
    key: "clumpLitter", cat: "litter", pets: ["cats"], supplier: "doha", image: IMG.essentials,
    name: "رمل قطط متكتل – بدون عطر", nameEn: "Clumping Cat Litter – Unscented",
    descriptionEn: "Bentonite clumping litter, low dust.",
    description: "رمل بنتونيت متكتل، قليل الغبار.",
    price: "22.00", cost: "12.00",
    variants: [
      { label: "5 لتر", labelEn: "5 L", price: "22.00", cost: "12.00", buy: 40 },
      { label: "10 لتر", labelEn: "10 L", price: "39.00", cost: "22.00", buy: 30 },
    ],
  },
  {
    key: "crystalLitter", cat: "litter", pets: ["cats"], supplier: "doha", image: IMG.essentials,
    name: "رمل كريستال سيليكا 3.8 لتر", nameEn: "Silica Crystal Litter 3.8 L",
    descriptionEn: "Absorbs odour for up to four weeks.",
    description: "يمتص الروائح حتى أربعة أسابيع.",
    price: "34.00", cost: "19.00", buy: 24,
  },
  {
    key: "trainingPads", cat: "litter", pets: ["dogs"], supplier: "doha", image: IMG.essentials,
    name: "حفاضات تدريب الجراء (30 قطعة)", nameEn: "Puppy Training Pads (30 pcs)",
    descriptionEn: "Leak-proof pads with attractant, 60 × 60 cm.",
    description: "حفاضات مانعة للتسرب مع جاذب، 60 × 60 سم.",
    price: "45.00", cost: "26.00", buy: 20,
  },
  {
    key: "shampoo", cat: "litter", pets: ["cats", "dogs"], supplier: "doha", image: IMG.grooming,
    name: "شامبو الحيوانات الأليفة – شوفان 250 مل", nameEn: "Pet Shampoo – Oatmeal 250 ml",
    descriptionEn: "Gentle oatmeal shampoo for sensitive skin.",
    description: "شامبو لطيف بالشوفان للبشرة الحساسة.",
    price: "28.00", cost: "14.00", buy: 24,
  },
  {
    key: "featherWand", cat: "toys", pets: ["cats"], supplier: "doha", image: IMG.essentials,
    name: "عصا ريش للقطط", nameEn: "Feather Wand Cat Toy",
    descriptionEn: "Telescopic wand with a replaceable feather toy.",
    description: "عصا قابلة للتمديد مع لعبة ريش قابلة للاستبدال.",
    price: "15.00", cost: "6.50", buy: 30,
  },
  {
    key: "ropeToy", cat: "toys", pets: ["dogs"], supplier: "doha", image: IMG.dog,
    name: "حبل شد للكلاب", nameEn: "Rope Tug Toy for Dogs",
    descriptionEn: "Cotton rope toy for tug and fetch.",
    description: "لعبة حبل قطني للشد والجلب.",
    price: "19.00", cost: "8.00", buy: 24,
  },
  {
    key: "collar", cat: "toys", pets: ["dogs"], supplier: "doha", image: IMG.dog,
    name: "طوق كلاب قابل للتعديل", nameEn: "Adjustable Dog Collar",
    descriptionEn: "Padded nylon collar with a quick-release buckle.",
    description: "طوق نايلون مبطّن بإبزيم سريع الفتح.",
    price: "35.00", cost: "15.00",
    variants: [
      { label: "صغير", labelEn: "Small", price: "35.00", cost: "15.00", buy: 10 },
      { label: "وسط", labelEn: "Medium", price: "39.00", cost: "17.00", buy: 10 },
      { label: "كبير", labelEn: "Large", price: "45.00", cost: "19.00", buy: 8 },
    ],
  },
  {
    key: "bowl", cat: "toys", pets: ["cats", "dogs"], supplier: "doha", image: IMG.essentials,
    name: "وعاء طعام ستانلس ستيل", nameEn: "Stainless Steel Pet Bowl",
    descriptionEn: "Non-slip rubber base, dishwasher safe.",
    description: "قاعدة مطاطية مانعة للانزلاق، آمن لغسالة الصحون.",
    price: "18.00", cost: "8.00",
    variants: [
      { label: "صغير", labelEn: "Small", price: "18.00", cost: "8.00", buy: 16 },
      { label: "كبير", labelEn: "Large", price: "26.00", cost: "11.50", buy: 12 },
    ],
  },
  {
    key: "scratchPost", cat: "toys", pets: ["cats"], supplier: "doha", image: IMG.cat,
    name: "عمود خدش للقطط 60 سم", nameEn: "Cat Scratching Post 60 cm",
    descriptionEn: "Sisal rope post with a plush perch.",
    description: "عمود حبل سيزال مع منصة ناعمة.",
    price: "119.00", cost: "62.00", buy: 6,
  },
];

const HOUSE = "/images/pet-houses/";

/** Ready-made pet houses. takesStock false = made to order (lead time, no stock). */
export const HOUSES = [
  {
    key: "catVilla", image: HOUSE + "cat_villa.png", pets: ["cats"], takesStock: true, buy: 3,
    name: "فيلا القطط – طابقان", nameEn: "Two-storey Cat Villa",
    price: "1450.00", cost: "820.00", houseDeliveryFee: "100.00", dims: [140, 90, 60],
    descriptionEn: "Solid pine villa with two levels, a balcony and a washable floor.",
    description: "فيلا من خشب الصنوبر بطابقين وشرفة وأرضية قابلة للغسل.",
  },
  {
    key: "tealVilla", image: HOUSE + "teal_villa.png", pets: ["cats"], takesStock: true, buy: 2,
    name: "فيلا القطط الفيروزية", nameEn: "Teal Cat Villa",
    price: "1290.00", cost: "730.00", houseDeliveryFee: "100.00", dims: [120, 80, 55],
    descriptionEn: "Painted villa with a sleeping loft and a scratching ramp.",
    description: "فيلا ملوّنة مع غرفة نوم علوية ومنحدر خدش.",
  },
  {
    key: "dogKennel", image: HOUSE + "dog_kennel.png", pets: ["dogs"], takesStock: true, buy: 2,
    name: "بيت كلاب خشبي", nameEn: "Wooden Dog Kennel",
    price: "1150.00", cost: "640.00", houseDeliveryFee: "100.00", dims: [95, 110, 80],
    descriptionEn: "Raised floor and a weather-proof roof for outdoor use.",
    description: "أرضية مرتفعة وسقف مقاوم للطقس للاستخدام الخارجي.",
  },
  {
    key: "aviary", image: HOUSE + "bird-arched-aviary.jpg", pets: ["birds"], takesStock: true, buy: 2,
    name: "قفص طيور مقوّس", nameEn: "Arched Bird Aviary",
    price: "980.00", cost: "540.00", houseDeliveryFee: "80.00", dims: [160, 80, 60],
    descriptionEn: "Large arched aviary on wheels with two feeding doors.",
    description: "قفص كبير مقوّس على عجلات مع بابين للتغذية.",
  },
  {
    key: "hutch", image: HOUSE + "small-oak-hutch.jpg", pets: ["small"], takesStock: true, buy: 2,
    name: "بيت أرانب من خشب البلوط", nameEn: "Oak Rabbit Hutch",
    price: "760.00", cost: "410.00", houseDeliveryFee: "80.00", dims: [90, 120, 60],
    descriptionEn: "Two-level hutch with a pull-out tray.",
    description: "بيت بطابقين مع صينية قابلة للسحب.",
  },
  {
    key: "capsule", image: HOUSE + "capsule_villa.png", pets: ["cats"], takesStock: false, leadTimeDays: 14,
    name: "فيلا الكبسولة", nameEn: "Capsule Villa",
    price: "2350.00", cost: "1300.00", houseDeliveryFee: "150.00", dims: [150, 100, 70],
    descriptionEn: "Made to order in our workshop. Choose your colour after ordering.",
    description: "يُصنع حسب الطلب في ورشتنا. اختر اللون بعد الطلب.",
  },
  {
    key: "blackCatio", image: HOUSE + "black_catio.png", pets: ["cats"], takesStock: false, leadTimeDays: 21,
    name: "كاتيو خارجي أسود", nameEn: "Black Outdoor Catio",
    price: "3900.00", cost: "2150.00", houseDeliveryFee: "250.00", dims: [200, 180, 120],
    descriptionEn: "Outdoor enclosure with shelves and a covered roof. Installed on site.",
    description: "حظيرة خارجية مع رفوف وسقف مغطى. يتم التركيب في الموقع.",
  },
  {
    key: "gardenCatio", image: HOUSE + "outdoor_catio.png", pets: ["cats"], takesStock: false, leadTimeDays: 25,
    name: "كاتيو الحديقة", nameEn: "Garden Catio",
    price: "4600.00", cost: "2600.00", houseDeliveryFee: "250.00", dims: [210, 240, 150],
    descriptionEn: "Walk-in garden catio, built to your measurements.",
    description: "كاتيو حديقة يمكن الدخول إليه، يُبنى حسب مقاساتك.",
  },
  {
    key: "macrame", image: HOUSE + "macrame_catio.png", pets: ["cats"], takesStock: false, leadTimeDays: 10,
    name: "كاتيو المكرمية", nameEn: "Macramé Catio",
    price: "1850.00", cost: "980.00", houseDeliveryFee: "120.00", dims: [170, 70, 50],
    descriptionEn: "Indoor catio with hand-knotted macramé hammocks.",
    description: "كاتيو داخلي مع أراجيح مكرمية معقودة يدوياً.",
  },
  {
    key: "twinCatio", image: HOUSE + "twin_catio.png", pets: ["cats"], takesStock: false, leadTimeDays: 30,
    name: "كاتيو مزدوج", nameEn: "Twin Catio",
    price: "5200.00", cost: "2900.00", houseDeliveryFee: "300.00", dims: [220, 260, 120],
    descriptionEn: "Two connected enclosures with a tunnel, for multi-cat homes.",
    description: "حظيرتان متصلتان بنفق، للمنازل التي فيها أكثر من قطة.",
  },
];

export const DELIVERY_AREAS = [
  { name: "الخليج الغربي", nameEn: "West Bay", fee: "15.00" },
  { name: "السد", nameEn: "Al Sadd", fee: "15.00" },
  { name: "اللؤلؤة", nameEn: "The Pearl", fee: "20.00" },
  { name: "لوسيل", nameEn: "Lusail", fee: "20.00" },
  { name: "الريان", nameEn: "Al Rayyan", fee: "20.00" },
  { name: "الوكرة", nameEn: "Al Wakrah", fee: "25.00" },
];

export const DELIVERY_WINDOWS = [
  { label: "صباحاً 10:00 – 13:00", labelEn: "Morning 10:00 – 13:00", startTime: "10:00", endTime: "13:00", seats: 6 },
  { label: "بعد الظهر 14:00 – 17:00", labelEn: "Afternoon 14:00 – 17:00", startTime: "14:00", endTime: "17:00", seats: 6 },
  { label: "مساءً 18:00 – 21:00", labelEn: "Evening 18:00 – 21:00", startTime: "18:00", endTime: "21:00", seats: 6 },
];

/** Grooming packages, grouped by pet type (the "group" is the pet type list). */
export const GROOMING = [
  {
    key: "catBasic", pets: ["cats"], name: "تنظيف أساسي للقطط", nameEn: "Cat – Basic groom", durationMin: 60, price: "120.00",
    includedEn: "Bath and blow-dry\nBrushing\nNail trim", included: "حمام وتجفيف\nتمشيط\nقص الأظافر",
  },
  {
    key: "catFull", pets: ["cats"], name: "تنظيف كامل للقطط", nameEn: "Cat – Full groom", durationMin: 120, price: "220.00",
    includedEn: "Everything in Basic\nHaircut or lion cut\nEar cleaning", included: "كل ما في الباقة الأساسية\nقص الشعر\nتنظيف الأذنين",
  },
  {
    key: "dogBasic", pets: ["dogs"], name: "تنظيف أساسي للكلاب", nameEn: "Dog – Basic groom", durationMin: 60, price: "140.00",
    includedEn: "Bath and blow-dry\nBrushing\nNail trim", included: "حمام وتجفيف\nتمشيط\nقص الأظافر",
  },
  {
    key: "dogFull", pets: ["dogs"], name: "تنظيف كامل للكلاب", nameEn: "Dog – Full groom", durationMin: 120, price: "260.00",
    includedEn: "Everything in Basic\nBreed haircut\nEar and teeth cleaning", included: "كل ما في الباقة الأساسية\nقص حسب السلالة\nتنظيف الأذنين والأسنان",
  },
];

/** Saturday–Thursday 10:00–18:00 (two groomers), Friday 14:00–20:00 (one). 0 = Sunday. */
export const GROOMING_SCHEDULE = [0, 1, 2, 3, 4, 6]
  .map((weekday) => ({ weekday, startTime: "10:00", endTime: "18:00", capacity: 2 }))
  .concat([{ weekday: 5, startTime: "14:00", endTime: "20:00", capacity: 1 }]);

/**
 * Customers. `web` = registered on the website (orders online, books grooming, relocation);
 * the others are walk-in regulars created at the till.
 */
export const CUSTOMERS = [
  { key: "noora", name: "نورة الكواري", nameEn: "Noora Al Kuwari", email: "noora.demo@example.com", phone: "+974 5000 0101", web: true, locale: "ar",
    area: "West Bay", address: "Tower 12, Apartment 1804, West Bay", pets: [{ name: "Luna", type: "cats", breed: "Persian", ageText: "3 years" }, { name: "Simba", type: "cats", breed: "British Shorthair", ageText: "1 year" }] },
  { key: "ahmed", name: "أحمد المهندي", nameEn: "Ahmed Al Muhannadi", email: "ahmed.demo@example.com", phone: "+974 5000 0102", web: true, locale: "ar",
    area: "Al Sadd", address: "Villa 7, Street 850, Al Sadd", pets: [{ name: "Max", type: "dogs", breed: "Golden Retriever", ageText: "4 years" }] },
  { key: "sarah", name: "Sarah Thompson", nameEn: "Sarah Thompson", email: "sarah.demo@example.com", phone: "+974 5000 0103", web: true, locale: "en",
    area: "The Pearl", address: "Porto Arabia, Tower 21, Apartment 902, The Pearl", pets: [{ name: "Milo", type: "cats", breed: "Ragdoll", ageText: "2 years" }, { name: "Coco", type: "dogs", breed: "Maltese", ageText: "5 years" }] },
  { key: "fatima", name: "فاطمة السليطي", nameEn: "Fatima Al Sulaiti", email: "fatima.demo@example.com", phone: "+974 5000 0104", web: true, locale: "ar",
    area: "Lusail", address: "Fox Hills, Building 9, Apartment 31, Lusail", pets: [{ name: "Kiwi", type: "birds", breed: "Budgie", ageText: "1 year" }, { name: "Mango", type: "birds", breed: "Cockatiel", ageText: "2 years" }] },
  { key: "omar", name: "عمر النعيمي", nameEn: "Omar Al Naimi", email: "omar.demo@example.com", phone: "+974 5000 0105", web: true, locale: "ar",
    area: "Al Rayyan", address: "Villa 22, Street 340, Al Rayyan", pets: [{ name: "Rocky", type: "dogs", breed: "German Shepherd", ageText: "3 years" }] },
  { key: "priya", name: "Priya Nair", nameEn: "Priya Nair", email: "priya.demo@example.com", phone: "+974 5000 0106", web: true, locale: "en",
    area: "Al Sadd", address: "Building 15, Apartment 7, Al Sadd", pets: [{ name: "Oreo", type: "cats", breed: "Domestic Shorthair", ageText: "6 years" }] },
  { key: "khalid", name: "خالد العطية", nameEn: "Khalid Al Attiyah", email: "khalid.demo@example.com", phone: "+974 5000 0107", web: true, locale: "ar",
    area: "Al Wakrah", address: "Villa 4, Street 112, Al Wakrah", pets: [{ name: "Thumper", type: "small", breed: "Holland Lop rabbit", ageText: "2 years" }, { name: "Shadow", type: "cats", breed: "Bengal", ageText: "4 years" }] },
  { key: "emma", name: "Emma Clarke", nameEn: "Emma Clarke", email: "emma.demo@example.com", phone: "+974 5000 0108", web: true, locale: "en",
    area: "West Bay", address: "Zig Zag Towers, Tower B, Apartment 1203, West Bay", pets: [{ name: "Bella", type: "dogs", breed: "Cavalier King Charles", ageText: "2 years" }] },
  { key: "hessa", name: "حصة الدرويش", nameEn: "Hessa Al Darwish", email: "hessa.demo@example.com", phone: "+974 5000 0109", web: true, locale: "ar",
    area: "Lusail", address: "Marina District, Tower 3, Apartment 1502, Lusail", pets: [{ name: "Lulu", type: "cats", breed: "Scottish Fold", ageText: "1 year" }] },
  { key: "yousef", name: "يوسف الخليفي", nameEn: "Yousef Al Khulaifi", email: "yousef.demo@example.com", phone: "+974 5000 0110", web: false,
    area: "Al Sadd", address: "Street 920, Al Sadd", pets: [{ name: "Nemo", type: "fish", breed: "Goldfish", ageText: "1 year" }] },
  { key: "maria", name: "Maria Santos", nameEn: "Maria Santos", email: "maria.demo@example.com", phone: "+974 5000 0111", web: false,
    area: "Al Rayyan", address: "Building 40, Al Rayyan", pets: [{ name: "Peanut", type: "small", breed: "Syrian hamster", ageText: "8 months" }] },
  { key: "abdulla", name: "عبدالله المري", nameEn: "Abdulla Al Marri", email: "abdulla.demo@example.com", phone: "+974 5000 0112", web: false,
    area: "Al Wakrah", address: "Villa 15, Al Wakrah", pets: [{ name: "Spike", type: "reptiles", breed: "Bearded dragon", ageText: "3 years" }, { name: "Duke", type: "dogs", breed: "Husky", ageText: "6 years" }] },
];

export const PROMOTIONS = {
  category: { name: "خصم 10% على طعام القطط", nameEn: "10% off cat food", kind: "CATEGORY", percent: "10", category: "catFood", channel: "ALL" },
  coupon: { name: "كوبون ترحيبي 15%", nameEn: "Welcome coupon 15%", kind: "PERCENT", percent: "15", code: "WELCOME15", minOrderAmount: "100.00", channel: "ALL" },
  bogo: { name: "اشترِ 2 واحصل على 1 مجاناً – أكياس الطعام الرطب", nameEn: "Buy 2 get 1 free – wet food pouches", kind: "BOGO", product: "wetPouch", buyQty: 2, getQty: 1, channel: "ALL" },
};

/** Tiny one-page PDF used as the relocation request's attached document. */
export function demoPdf(title) {
  const text = String(title).replace(/[()\\]/g, "");
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
