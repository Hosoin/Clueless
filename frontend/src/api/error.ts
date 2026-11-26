// API 요청이 실패했을 때 던지는 에러.
// status: HTTP 상태 코드 (서버에 닿지 못했으면 0), code: 에러 종류를 구분하는 영문 코드, message: 사용자에게 보여 줄 문구
export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
