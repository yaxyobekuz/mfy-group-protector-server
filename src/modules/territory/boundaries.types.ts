/**
 * CHEGARA GEOMETRIYASINING TURI.
 *
 * ⚠️ ALOHIDA FAYLDA, `boundaries.data.ts` ICHIDA EMAS: ma'lumot
 * fayli SKRIPT tomonidan qayta yoziladi (`--emit`) va u yerda
 * yozilgan tur har yasalishda yo'qolib ketardi.
 *
 * ⚠️ FAQAT IKKI TUR: chegara — poligon. `Point`, `LineString` va
 * boshqalari bu yerda ma'nosiz va ularni qabul qilish xaritada
 * chizilmaydigan qiymatni bazaga o'tkazib yuborardi.
 */
export type GeoGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };
