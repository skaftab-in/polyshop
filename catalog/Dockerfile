# ---- Build stage ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Maven settings that survive a slow/flaky connection:
# longer timeouts and automatic retries on failed downloads.
ENV MAVEN_OPTS="-Dmaven.wagon.http.retryHandler.count=5 \
  -Dmaven.wagon.httpconnectionManager.ttlSeconds=120 \
  -Dmaven.wagon.rto=120000"

COPY pom.xml .
COPY src ./src

# Build the jar directly. This downloads ONLY what the app needs (no site plugin),
# and the cache mount keeps every downloaded file across attempts, so a retry
# resumes instead of starting over.
RUN --mount=type=cache,target=/root/.m2 mvn clean package -DskipTests -B

# ---- Run stage ----
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/catalog-1.0.0.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
