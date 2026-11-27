# 프론트엔드 웹 배포용 이미지: Node로 빌드하고 nginx로 정적 파일을 서빙한다.
# 폰 앱(Capacitor)은 이 이미지를 쓰지 않고 npm run build로 만든 dist/를 앱 안에 넣는다.
#
# 빌드:  docker build -t clueless-frontend ./frontend
# 실행:  docker run --rm -p 5173:80 -e API_UPSTREAM=http://host.docker.internal:8081 clueless-frontend
#        → http://localhost:5173 (포트를 5173으로 여는 이유는 README의 "Docker로 띄우기" 참고)

# 1단계: 빌드. CI(.github/workflows/frontend-ci.yml)와 같은 Node 22
FROM node:22-alpine AS build
WORKDIR /app

# package 파일만 먼저 복사해 의존성 설치 층을 캐시한다 (코드만 바뀌면 npm ci를 다시 하지 않음)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_ 값은 빌드할 때 JS 파일에 그대로 박히고 누구나 볼 수 있다. 비밀값을 넣지 않는다.
# 비워 두면(기본) 같은 출처의 /api로 요청하고, 아래 nginx가 백엔드로 전달한다.
ARG VITE_CLOSET_API_URL=
ENV VITE_CLOSET_API_URL=${VITE_CLOSET_API_URL}
# Google 로그인을 시작할 백엔드 주소(화면 이동용). 비우면 http://localhost:8081로 가므로 배포 빌드에서는
# docker build --build-arg VITE_CLOSET_LOGIN_URL=<BE 배포 주소> 로 넣는다. (src/api/auth.ts)
ARG VITE_CLOSET_LOGIN_URL=
ENV VITE_CLOSET_LOGIN_URL=${VITE_CLOSET_LOGIN_URL}
RUN npm run build

# 2단계: 정적 파일 서빙 + /api 전달
FROM nginx:1.27-alpine

# nginx 공식 이미지는 시작할 때 templates/*.template의 ${환경 변수}를 채워 conf.d/에 넣는다.
# NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 이면 컨테이너의 DNS 주소가 ${NGINX_LOCAL_RESOLVERS}로 들어간다.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# /api를 전달할 closet-service 주소. VM에서는 공용 Docker 네트워크 clueless 안의 서비스 이름(closet-service)으로 부른다.
# 내 PC의 백엔드를 쓸 때는 -e API_UPSTREAM=http://host.docker.internal:8081 로 바꾼다. (README의 "VM에 배포하기")
# 끝에 /나 경로를 붙이지 않는다 (http://host:8081 O, http://host:8081/ X). 이유는 nginx/default.conf.template 참고.
# 백엔드 컨테이너는 clueless 네트워크에 서비스 이름 closet-service, 포트 8081로 띄운다.
ENV API_UPSTREAM=http://closet-service:8081 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

EXPOSE 80
