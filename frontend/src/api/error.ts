// API 요청이 실패했을 때 던지는 에러.
// status: HTTP 상태 코드 (서버에 닿지 못했거나 시간이 지나도 응답이 없으면 0), code: 에러 종류를 구분하는 영문 코드, message: 사용자에게 보여 줄 문구
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * 실패한 요청을 화면에 보여 줄 문구로 바꾼다 (docs/API_CONVENTION.md 3장 "화면에 보여 주기").
 * - 서버에 닿지 못함·시간 초과(status 0): '서버에 연결할 수 없어요'
 * - 서버 오류(5xx): '잠시 후 다시 시도해 주세요' (서버 내부 메시지를 그대로 보여 주지 않는다)
 * - 그 밖의 ApiError: 요청 함수가 정해 둔 message
 * - ApiError가 아닌 예외(코드 실수 등): 일반 문구
 */
export function errorText(e: unknown): string {
  if (!(e instanceof ApiError)) return '문제가 생겼어요. 잠시 후 다시 시도해 주세요'
  if (e.status === 0) return '서버에 연결할 수 없어요'
  if (e.status >= 500) return '잠시 후 다시 시도해 주세요'
  return e.message
}
