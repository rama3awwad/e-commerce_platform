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

# Soketi (WebSocket): المتصفح يتصل به مباشرة، والقيم تطابق PUSHER_APP_KEY بملف .env تبع الباك
ARG VITE_PUSHER_KEY=app-key
ARG VITE_PUSHER_HOST=localhost
ARG VITE_PUSHER_PORT=6001
ENV VITE_PUSHER_KEY=$VITE_PUSHER_KEY
ENV VITE_PUSHER_HOST=$VITE_PUSHER_HOST
ENV VITE_PUSHER_PORT=$VITE_PUSHER_PORT

RUN npm run build

# ===== المرحلة 2: تقديم الملفات عبر nginx =====
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]