type CategoryRule = {
  category: string;
  subcategory: string;
  keywords: string[];
};

const rules: CategoryRule[] = [
  {
    category: "Real Estate",
    subcategory: "Investors",
    keywords: [
      "real estate invest",
      "rei ",
      "flip",
      "wholesale real estate",
      "rental property",
      "landlord",
    ],
  },
  {
    category: "Real Estate",
    subcategory: "Agents",
    keywords: ["realtor", "real estate agent", "realty", "mls ", "listing agent", "buyer agent"],
  },
  {
    category: "Real Estate",
    subcategory: "General",
    keywords: ["real estate", "property", "housing market", "home buyer", "home seller"],
  },
  {
    category: "Home Services",
    subcategory: "Landscaping",
    keywords: ["landscap", "lawn care", "lawn mowing", "yard work", "hardscape", "irrigation"],
  },
  {
    category: "Home Services",
    subcategory: "HVAC",
    keywords: ["hvac", "heating and cooling", "air conditioning", "furnace"],
  },
  {
    category: "Home Services",
    subcategory: "Plumbing",
    keywords: ["plumb", "plumber", "drain"],
  },
  {
    category: "Home Services",
    subcategory: "Roofing",
    keywords: ["roof", "roofing", "gutter"],
  },
  {
    category: "Home Services",
    subcategory: "General",
    keywords: [
      "home service",
      "home improvement",
      "handyman",
      "contractor",
      "remodel",
      "renovation",
      "painting",
      "flooring",
      "electrician",
      "pest control",
    ],
  },
  {
    category: "Marketing",
    subcategory: "",
    keywords: [
      "marketing",
      "digital marketing",
      "social media market",
      "seo ",
      "lead gen",
      "advertising",
      "facebook ads",
      "google ads",
      "ppc ",
    ],
  },
  {
    category: "Business",
    subcategory: "Entrepreneurs",
    keywords: ["entrepreneur", "startup", "side hustle", "solopreneur", "business owner"],
  },
  {
    category: "Business",
    subcategory: "Small Business",
    keywords: ["small business", "local business", "shop local", "main street"],
  },
  {
    category: "Business",
    subcategory: "Networking",
    keywords: ["networking", "bni ", "referral", "business connect", "leads group", "mastermind"],
  },
  {
    category: "Business",
    subcategory: "General",
    keywords: ["business", "b2b", "sales ", "selling"],
  },
  {
    category: "Automotive",
    subcategory: "",
    keywords: [
      "auto repair",
      "mechanic",
      "car ",
      "auto body",
      "auto shop",
      "detailing",
      "car wash",
      "automotive",
    ],
  },
  {
    category: "Health & Wellness",
    subcategory: "",
    keywords: [
      "fitness",
      "gym ",
      "personal trainer",
      "yoga",
      "chiropract",
      "dentist",
      "dental",
      "medical",
      "health",
      "wellness",
      "spa ",
      "massage",
    ],
  },
  {
    category: "Food & Restaurant",
    subcategory: "",
    keywords: [
      "restaurant",
      "food truck",
      "catering",
      "bakery",
      "cafe ",
      "coffee shop",
      "bar ",
      "brewery",
      "pizza",
    ],
  },
  {
    category: "Legal",
    subcategory: "",
    keywords: ["lawyer", "attorney", "law firm", "legal"],
  },
  {
    category: "Finance",
    subcategory: "",
    keywords: ["accountant", "bookkeep", "tax ", "financial", "insurance", "mortgage", "loan"],
  },
  {
    category: "Community",
    subcategory: "",
    keywords: [
      "buy sell trade",
      "yard sale",
      "garage sale",
      "marketplace",
      "community",
      "neighborhood",
      "town ",
      "city of ",
    ],
  },
];

export function categorizeGroupName(name: string): { category: string; subcategory: string } {
  const lower = name.toLowerCase();
  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      if (lower.includes(keyword)) {
        return { category: rule.category, subcategory: rule.subcategory };
      }
    }
  }
  return { category: "Uncategorized", subcategory: "" };
}
