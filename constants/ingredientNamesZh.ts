/**
 * English → Chinese ingredient name map.
 * Keys are lowercase, spaces normalized (underscores converted before lookup).
 */
const INGREDIENT_ZH: Record<string, string> = {
  // Juices
  "lime juice": "萊姆汁",
  "lemon juice": "檸檬汁",
  "orange juice": "柳橙汁",
  "grapefruit juice": "葡萄柚汁",
  "pineapple juice": "鳳梨汁",
  "cranberry juice": "蔓越莓汁",
  "tomato juice": "番茄汁",
  "apple juice": "蘋果汁",
  "passion fruit juice": "百香果汁",
  "mango juice": "芒果汁",
  "pomegranate juice": "石榴汁",

  // Spirits
  "vodka": "伏特加",
  "gin": "琴酒",
  "rum": "蘭姆酒",
  "white rum": "白蘭姆酒",
  "dark rum": "黑蘭姆酒",
  "aged rum": "陳年蘭姆酒",
  "tequila": "龍舌蘭",
  "blanco tequila": "白色龍舌蘭",
  "reposado tequila": "陳年龍舌蘭",
  "mezcal": "梅茲卡爾",
  "whiskey": "威士忌",
  "bourbon": "波本威士忌",
  "rye whiskey": "黑麥威士忌",
  "scotch": "蘇格蘭威士忌",
  "scotch whisky": "蘇格蘭威士忌",
  "irish whiskey": "愛爾蘭威士忌",
  "brandy": "白蘭地",
  "cognac": "干邑白蘭地",
  "pisco": "皮斯科",
  "absinthe": "苦艾酒",
  "cachaça": "卡沙薩",
  "cachaca": "卡沙薩",

  // Liqueurs & Modifiers
  "triple sec": "橙皮酒",
  "cointreau": "君度橙酒",
  "blue curacao": "藍橙皮酒",
  "orange curacao": "橙皮酒",
  "amaretto": "杏仁香甜酒",
  "kahlua": "咖啡香甜酒",
  "coffee liqueur": "咖啡香甜酒",
  "baileys": "百利甜酒",
  "irish cream": "愛爾蘭奶油酒",
  "peach schnapps": "水蜜桃香甜酒",
  "elderflower liqueur": "接骨木花利口酒",
  "st germain": "聖日耳曼",
  "limoncello": "檸檬香甜酒",
  "maraschino liqueur": "馬拉斯奇諾酒",
  "maraschino": "馬拉斯奇諾酒",
  "campari": "金巴利",
  "aperol": "艾普羅",
  "chartreuse": "查特勒茲",
  "green chartreuse": "綠色查特勒茲",
  "yellow chartreuse": "黃色查特勒茲",
  "benedictine": "班尼狄克丁",
  "frangelico": "榛果香甜酒",
  "midori": "蜜多利蜜瓜酒",
  "chambord": "黑莓利口酒",
  "drambuie": "杜林標",
  "grand marnier": "柑曼怡",
  "disaronno": "迪薩蘿那杏仁酒",

  // Vermouth & Fortified
  "dry vermouth": "不甜苦艾酒",
  "sweet vermouth": "甜苦艾酒",
  "vermouth": "苦艾酒",
  "fino sherry": "菲諾雪莉酒",
  "sherry": "雪莉酒",
  "port": "波特酒",
  "lillet blanc": "麗葉白酒",

  // Wine & Beer
  "champagne": "香檳",
  "prosecco": "普羅賽克氣泡酒",
  "sparkling wine": "氣泡酒",
  "white wine": "白葡萄酒",
  "red wine": "紅葡萄酒",
  "rosé wine": "粉紅葡萄酒",
  "rose wine": "粉紅葡萄酒",
  "beer": "啤酒",
  "lager": "拉格啤酒",
  "stout": "黑啤酒",

  // Mixers & Sodas
  "club soda": "蘇打水",
  "soda water": "蘇打水",
  "tonic water": "通寧水",
  "ginger beer": "薑汁啤酒",
  "ginger ale": "薑汁汽水",
  "cola": "可樂",
  "lemonade": "檸檬水",
  "sparkling water": "氣泡水",

  // Syrups & Sweeteners
  "simple syrup": "糖漿",
  "sugar syrup": "糖漿",
  "grenadine": "紅石榴糖漿",
  "orgeat": "杏仁糖漿",
  "agave syrup": "龍舌蘭糖漿",
  "honey syrup": "蜂蜜糖漿",
  "honey": "蜂蜜",
  "sugar": "糖",
  "brown sugar": "紅糖",
  "demerara syrup": "德梅拉拉糖漿",
  "falernum": "法勒南姆",

  // Bitters
  "angostura bitters": "安格仕苦精",
  "bitters": "苦精",
  "peychaud's bitters": "佩肖苦精",
  "orange bitters": "橙皮苦精",
  "mole bitters": "巧克力辣椒苦精",

  // Dairy & Eggs
  "egg white": "蛋白",
  "egg yolk": "蛋黃",
  "heavy cream": "鮮奶油",
  "cream": "鮮奶油",
  "milk": "牛奶",
  "coconut cream": "椰漿",
  "coconut milk": "椰奶",
  "half and half": "半乳",

  // Fruits & Garnishes
  "lime": "萊姆",
  "lemon": "檸檬",
  "orange": "柳橙",
  "cucumber": "黃瓜",
  "mint": "薄荷",
  "fresh mint": "新鮮薄荷",
  "basil": "羅勒",
  "ginger": "薑",
  "fresh ginger": "新鮮薑",
  "raspberry": "覆盆子",
  "strawberry": "草莓",
  "blackberry": "黑莓",
  "muddled mint": "搗碎薄荷",
  "muddled lime": "搗碎萊姆",
  "lime wedge": "萊姆角",
  "lemon wedge": "檸檬角",
  "maraschino cherry": "馬拉斯奇諾酒漬櫻桃",
  "cherry": "櫻桃",
  "olive": "橄欖",
  "celery": "芹菜",
  "salt": "鹽",
  "sea salt": "海鹽",
  "black pepper": "黑胡椒",

  // Misc
  "ice": "冰塊",
  "cream of coconut": "椰漿",
  "blue cheese": "藍紋起司",
  "tabasco": "塔巴斯科辣椒醬",
  "worcestershire sauce": "伍斯特醬",
  "horseradish": "辣根",
  "matcha": "抹茶",
  "espresso": "濃縮咖啡",
  "cold brew coffee": "冷萃咖啡",
  "tea": "茶",
  "green tea": "綠茶",
};

/**
 * Translate an English ingredient name to Chinese.
 * Falls back to the original display name if not found.
 */
export function translateIngredient(displayName: string): string {
  const normalized = displayName.toLowerCase().replace(/_/g, " ").trim();
  return INGREDIENT_ZH[normalized] ?? displayName;
}
