FROM eclipse-temurin:17-jdk-alpine AS builder

WORKDIR /app
COPY backend/gradlew ./gradlew
COPY backend/gradle ./gradle
COPY backend/build.gradle backend/settings.gradle ./
RUN chmod +x ./gradlew
RUN ./gradlew dependencies --no-daemon

COPY backend/src ./src
RUN ./gradlew bootJar --no-daemon -x test

FROM eclipse-temurin:17-jre-alpine

WORKDIR /app
RUN apk add --no-cache curl
COPY --from=builder /app/build/libs/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
