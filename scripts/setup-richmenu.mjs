/**
 * 建立圖文選單(Rich Menu)並設為所有使用者的預設選單。
 * 依官方 Messaging API:
 *   1. POST https://api.line.me/v2/bot/richmenu            → 建立選單、取得 richMenuId
 *   2. POST https://api-data.line.me/v2/bot/richmenu/{id}/content → 上傳選單圖片
 *   3. POST https://api.line.me/v2/bot/user/all/richmenu/{id}     → 設為預設
 *
 * 使用方式(在本機執行一次即可):
 *   LINE_CHANNEL_ACCESS_TOKEN=xxx LIFF_URL=https://liff.line.me/你的LIFF_ID \
 *     node scripts/setup-richmenu.mjs ./richmenu.jpg
 *
 * 圖片規格:2500x843(小版)或 2500x1686,JPEG/PNG,1MB 以下。
 * 註:不想寫程式的話,LINE Official Account Manager 後台也能用介面建立圖文選單。
 */

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
const liffUrl = process.env.LIFF_URL // 例:https://liff.line.me/1234567890-AbcdEfgh
const imagePath = process.argv[2]

if (!token || !liffUrl || !imagePath) {
  console.error('缺少參數。用法:LINE_CHANNEL_ACCESS_TOKEN=... LIFF_URL=... node scripts/setup-richmenu.mjs ./richmenu.jpg')
  process.exit(1)
}

// 2500x843 三等分:預約諮詢(LIFF)/ 服務方案 / 聯絡我們
const richMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: 'lumo-main-menu',
  chatBarText: '功能選單',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 833, height: 843 },
      action: { type: 'uri', label: '預約諮詢', uri: liffUrl },
    },
    {
      bounds: { x: 833, y: 0, width: 834, height: 843 },
      action: { type: 'message', label: '服務方案', text: '方案' },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: 'message', label: '聯絡我們', text: '聯絡' },
    },
  ],
}

const auth = { Authorization: `Bearer ${token}` }

// 1) 建立選單
let res = await fetch('https://api.line.me/v2/bot/richmenu', {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify(richMenu),
})
if (!res.ok) throw new Error(`建立選單失敗 ${res.status}: ${await res.text()}`)
const { richMenuId } = await res.json()
console.log('richMenuId =', richMenuId)

// 2) 上傳圖片
const { readFile } = await import('node:fs/promises')
const image = await readFile(imagePath)
const contentType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': contentType },
  body: image,
})
if (!res.ok) throw new Error(`上傳圖片失敗 ${res.status}: ${await res.text()}`)
console.log('圖片上傳完成')

// 3) 設為所有使用者預設
res = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
  method: 'POST',
  headers: auth,
})
if (!res.ok) throw new Error(`設定預設選單失敗 ${res.status}: ${await res.text()}`)
console.log('圖文選單已上線 ✅')
