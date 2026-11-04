# ===== المرحلة 1: بناء الواجهة =====
FROM node:22-alpine AS build
WORKDIR /app

# ننزل الاعتمادات أولاً للاستفادة من كاش الدوكر
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# عنوان الـ API بينبعج بالبناء (نفس قيمة VITE_API_URL بـ .env)
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ===== المرحلة 2: تقديم الملفات عبر nginx =====
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
