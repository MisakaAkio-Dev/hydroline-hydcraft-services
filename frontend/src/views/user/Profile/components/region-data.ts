// 仅提供 中国 与 海外 两项选择，省级单位中含港澳台
export type CountryCode = 'CN' | 'OTHER'

export const countries: { code: CountryCode; name: string }[] = [
  { code: 'CN', name: '中国' },
  { code: 'OTHER', name: '海外/其他地区' },
]

// 视作“直辖/单层级”处理的省级单位（选择后无需再选城市）
export const municipalities = [
  '北京市',
  '上海市',
  '天津市',
  '重庆市',
  // 港澳按单层级处理
  '香港特别行政区',
  '澳门特别行政区',
]

// 选择后无需选择城市/区县的省级单位（港澳台）
export const singleLevelRegions = [
  '香港特别行政区',
  '澳门特别行政区',
  '台湾省',
]

export const provinces: string[] = [
  '北京市',
  '上海市',
  '天津市',
  '重庆市',
  '河北省',
  '山西省',
  '辽宁省',
  '吉林省',
  '黑龙江省',
  '江苏省',
  '浙江省',
  '安徽省',
  '福建省',
  '江西省',
  '山东省',
  '河南省',
  '湖北省',
  '湖南省',
  '广东省',
  '海南省',
  '四川省',
  '贵州省',
  '云南省',
  '陕西省',
  '甘肃省',
  '青海省',
  '台湾省',
  '内蒙古自治区',
  '广西壮族自治区',
  '西藏自治区',
  '宁夏回族自治区',
  '新疆维吾尔自治区',
  // 加入港澳，合计 34 个省级行政区
  '香港特别行政区',
  '澳门特别行政区',
]

// Due to dataset size, we ship minimal placeholders.
// Apps can replace this with a full administrative divisions dataset later.
export const citiesMap: Record<string, string[]> = {}

export const districtsMap: Record<string, string[]> = {}

// 注意：地级与区县数据改由 `china-division` 动态加载提供。
