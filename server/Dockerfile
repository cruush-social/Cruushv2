FROM node:22-alpine AS dng-decoder
RUN apk add --no-cache build-base clang cmake ninja pkgconf git curl unzip \
    jpeg-dev libjxl-dev lcms2-dev zlib-dev expat-dev brotli-dev highway-dev
WORKDIR /decoder
# Adobe DNG SDK 1.7.1 supplies JPEG-XL DNG decoding missing from stock LibRaw.
RUN curl --fail --location --retry 3 \
      https://download.adobe.com/pub/adobe/dng/dng_sdk_1_7_1_2724_20260908.zip \
      --output sdk.zip \
    && echo '740fbe95c69e09e9cd17654a5e4fef2d7021254b06fd2b8c5557b79a1496b50c  sdk.zip' | sha256sum -c - \
    && unzip -q sdk.zip -d sdk \
    && git init cmake \
    && git -C cmake fetch --depth 1 https://github.com/ssh4net/DNG-CMake.git 685f7139ba87afba2e40d4fd24a6455db6f8e9d9 \
    && git -C cmake checkout --detach FETCH_HEAD \
    && cp -R sdk/dng_sdk_1_7_1/dng_sdk sdk/dng_sdk_1_7_1/xmp cmake/ \
    && cmake -S cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ \
      -DDNG_WITH_XMP=ON -DDNG_WITH_JXL=ON -DDNG_WITH_JPEG=ON \
    && cmake --build build --target dng_validate --parallel 2 \
    && mkdir -p /out/licenses \
    && find build -type f -name dng_validate -exec cp {} /out/dng_validate \; \
    && cp sdk/dng_sdk_1_7_1/LICENSE.txt /out/licenses/Adobe-DNG-SDK.txt \
    && cp cmake/LICENSE /out/licenses/DNG-CMake.txt

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libheif-tools libraw-tools exiftool imagemagick expat jpeg lcms2 libjxl
COPY --from=dng-decoder /out/dng_validate /usr/local/bin/dng_validate
COPY --from=dng-decoder /out/licenses /usr/local/share/licenses/dng-decoder
ARG SOURCE_COMMIT=""
ENV NODE_ENV=production
ENV APP_BUILD_SHA=$SOURCE_COMMIT
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY sql ./sql
COPY ops/run-migrations.mjs ./ops/run-migrations.mjs
EXPOSE 3001
CMD ["npm", "run", "start"]
