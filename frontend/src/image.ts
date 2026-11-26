// 사진 줄이기: 서버로 보내기 전에 옷 사진을 1024×1024px 정사각형 JPEG로 만든다.
// 폰 카메라 사진은 한 장에 3~10MB(4000px 안팎)라 그대로 보내면 업로드가 느리고 데이터를 많이 쓴다.
// 옷 종류·색 분석에는 1024px이면 충분해서, 올리기 전에 브라우저에서 미리 줄인다.
// 가로·세로를 모두 1024px로 맞추려고, 사진 전체를 비율 그대로 정사각형 안에 넣고 남는 곳은 흰 여백으로 채운다.
// 자르지 않는 이유: 코트 밑단이나 소매 끝이 잘리면 옷 종류 분석이 틀릴 수 있어서다.
// 다시 그려서 저장하므로 사진에 붙은 위치(GPS)·기기 정보(EXIF)도 함께 빠진다.

/** 만들 사진의 가로·세로 길이(px). 서버와 정한 값이 바뀌면 여기만 고친다 */
export const MAX_SIDE = 1024
/** JPEG 품질 (0~1). 0.85는 눈으로 차이가 거의 없으면서 용량이 크게 주는 값 */
export const JPEG_QUALITY = 0.85

/**
 * 사진을 읽어 그릴 수 있는 형태로 연다.
 * createImageBitmap이 빠르고 메모리를 덜 쓰지만, 일부 브라우저(오래된 Safari 등)에서 실패할 수 있어 <img>로 한 번 더 시도한다.
 * 둘 다 사진 회전 정보(EXIF)를 반영해서 세로로 찍은 사진이 눕지 않는다.
 * 결과: 그리기용 원본과 그 가로·세로, 다 쓰고 부를 정리 함수
 */
async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() }
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const im = new Image()
      im.src = url
      await im.decode()
      return { src: im, w: im.naturalWidth, h: im.naturalHeight, done: () => URL.revokeObjectURL(url) }
    } catch (e) {
      URL.revokeObjectURL(url)
      throw e
    }
  }
}

/**
 * 사진 한 장을 maxSide×maxSide px 정사각형 JPEG로 만든다.
 * - 사진은 비율을 지킨 채 긴 변이 maxSide가 되게 맞추고 가운데에 둔다. 짧은 변 쪽 남는 곳은 흰 여백이다
 *   (예: 4000×3000 → 1024×768로 줄여 위아래에 128px씩 흰 여백)
 * - maxSide보다 작은 사진은 키워서 맞춘다. 사진마다 옷이 차지하는 크기가 비슷해야 분석이 고르게 되기 때문이다
 * - 입력: 앨범에서 고른 파일이나 카메라로 찍은 Blob
 * - 결과: 1024×1024 JPEG Blob (서버로 보낼 것)
 * - 브라우저가 열 수 없는 형식이면(예: 데스크톱 Chrome의 HEIC) 원본을 그대로 돌려준다.
 *   옷 등록 흐름이 멈추지 않게 하려는 것이고, 이 경우 화면에도 사진이 안 보일 수 있다
 */
export async function resizeImage(file: Blob, maxSide = MAX_SIDE, quality = JPEG_QUALITY): Promise<Blob> {
  let img: Awaited<ReturnType<typeof decode>>
  try { img = await decode(file) } catch { return file }
  try {
    const scale = maxSide / Math.max(img.w, img.h) // 긴 변이 정사각형에 꼭 맞는 배율
    const w = Math.max(1, Math.round(img.w * scale)), h = Math.max(1, Math.round(img.h * scale))
    const c = document.createElement('canvas'); c.width = c.height = maxSide
    const ctx = c.getContext('2d')
    if (!ctx) return file
    // 흰 바탕을 먼저 깐다: 짧은 변 쪽 여백이 되고, 투명한 PNG가 JPEG로 저장될 때 배경이 검게 되는 것도 막는다
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, maxSide, maxSide)
    ctx.imageSmoothingQuality = 'high' // 크게 줄일 때 계단 현상을 줄임
    ctx.drawImage(img.src, Math.round((maxSide - w) / 2), Math.round((maxSide - h) / 2), w, h) // 가운데에 둠
    const out = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', quality))
    return out ?? file // 저장에 실패하면(메모리 부족 등) 원본으로
  } finally {
    img.done()
  }
}
