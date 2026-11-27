/**
 * Demo content for analytics and reports (fix-rc), used by scripts/demo-data.mjs:
 *  - more website sign-ups spread over the month at different hours (the "new registered users"
 *    chart then has something on most weeks), customers who have not ordered yet;
 *  - grooming bookings taken by phone at the desk: two cancelled, one no-show;
 *  - payees and receipt numbers for the demo expenses.
 * Everything goes through the app's API like the rest of the demo, so `remove` deletes it.
 */
export const EXTRA_SIGNUPS = [
  { key: "maryam", name: "مريم الخليفي", nameEn: "Maryam Al Khulaifi", email: "maryam.demo@example.com", phone: "+974 5000 0110", web: true, locale: "ar",
    area: "Al Sadd", address: "Building 33, Apartment 4, Al Sadd", pets: [], day: -19, time: "07:40" },
  { key: "james", name: "James Wilson", nameEn: "James Wilson", email: "james.demo@example.com", phone: "+974 5000 0111", web: true, locale: "en",
    area: "West Bay", address: "Tower 5, Apartment 2201, West Bay", pets: [], day: -14, time: "13:25" },
  { key: "aisha", name: "عائشة المري", nameEn: "Aisha Al Marri", email: "aisha.demo@example.com", phone: "+974 5000 0112", web: true, locale: "ar",
    area: "Lusail", address: "Marina District, Building 2, Apartment 17, Lusail", pets: [], day: -9, time: "23:20" },
  { key: "rahul", name: "Rahul Menon", nameEn: "Rahul Menon", email: "rahul.demo@example.com", phone: "+974 5000 0113", web: true, locale: "en",
    area: "The Pearl", address: "Viva Bahriya, Tower 3, Apartment 605, The Pearl", pets: [], day: -4, time: "16:05" },
  { key: "latifa", name: "لطيفة السويدي", nameEn: "Latifa Al Suwaidi", email: "latifa.demo@example.com", phone: "+974 5000 0114", web: true, locale: "ar",
    area: "West Bay", address: "Tower 18, Apartment 707, West Bay", pets: [], day: -1, time: "11:50" },
];

/** Desk bookings: [key, day, wanted time, customer key, package key, outcome]. */
export const DESK_BOOKINGS = [
  ["d1", -18, "11:00", "fatima", "catBasic", "cancel"],
  ["d2", -7, "15:00", "omar", "dogBasic", "cancel"],
  ["d3", -3, "10:00", "priya", "catBasic", "noshow"],
];

/** Payee and receipt number for each demo expense, by its description. */
export const EXPENSE_PAYEES = {
  "Shop rent – Al Waab (monthly)": ["Al Waab Properties", "RNT-2611-01"],
  "Warehouse rent – Industrial Area (monthly)": ["Industrial Area Warehousing", "RNT-2611-02"],
  "Kahramaa – shop electricity and water": ["Kahramaa", "KM-88412"],
  "Kahramaa – warehouse electricity": ["Kahramaa", "KM-88413"],
  "Supplies – cleaning products and receipt rolls": ["Lulu Hypermarket", "LH-40021"],
  "Supplies – carrier bags and packing tape": ["Lulu Hypermarket", "LH-40388"],
  "Fuel – sales vans": ["Woqod", null],
};
