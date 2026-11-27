FROM eclipse-temurin:21-jdk AS build
WORKDIR /build

COPY gradlew build.gradle settings.gradle ./
COPY gradle/wrapper/ gradle/wrapper/
COPY closet-service/src/main/ closet-service/src/main/
# Gradle requires every project included by settings.gradle to have a directory.
RUN mkdir recommendation-service && ./gradlew --no-daemon :closet-service:bootJar

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/closet-service/build/libs/closet-service.jar app.jar
USER 10001:10001
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
