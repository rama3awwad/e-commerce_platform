#!/bin/sh
set -eu
BASE_URL="${BASE_URL:-http://localhost:3000/api/v1}"
PASSWORD="${DEMO_PASSWORD:-Admin@123}"
json_value() { node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{const p=process.argv[1].split(".");let v=JSON.parse(d);for(const k of p)v=v[k];process.stdout.write(String(v))})' "$1"; }
login() { curl -fsS -H 'Content-Type: application/json' -d "{\"identifier\":\"$1\",\"password\":\"$PASSWORD\"}" "$BASE_URL/auth/login"; }
echo 'Customer login'
CUSTOMER_JSON="$(login customer@test.com)"
CUSTOMER_TOKEN="$(printf '%s' "$CUSTOMER_JSON" | json_value data.accessToken)"
echo 'List products'
PRODUCTS="$(curl -fsS -H "Authorization: Bearer $CUSTOMER_TOKEN" "$BASE_URL/products?page=1&limit=2")"
printf '%s\n' "$PRODUCTS"
PRODUCT_ID="$(printf '%s' "$PRODUCTS" | json_value data.items.0.id)"
echo 'Create order'
ORDER="$(curl -fsS -H "Authorization: Bearer $CUSTOMER_TOKEN" -H 'Content-Type: application/json' -d "{\"items\":[{\"productId\":\"$PRODUCT_ID\",\"quantity\":1}]}" "$BASE_URL/orders")"
printf '%s\n' "$ORDER"
ORDER_ID="$(printf '%s' "$ORDER" | json_value data.id)"
echo 'Another customer receives 403 reading the order'
OTHER_JSON="$(login customer2@test.com)"
OTHER_TOKEN="$(printf '%s' "$OTHER_JSON" | json_value data.accessToken)"
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Authorization: Bearer $OTHER_TOKEN" "$BASE_URL/orders/$ORDER_ID"
echo 'Admin gets 409 for invalid PENDING to PENDING transition'
ADMIN_JSON="$(login admin@store.com)"
ADMIN_TOKEN="$(printf '%s' "$ADMIN_JSON" | json_value data.accessToken)"
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' -d '{"status":"PENDING"}' "$BASE_URL/orders/$ORDER_ID/status"
echo 'Exceed login throttle; final attempt should return 429'
for n in 1 2 3; do curl -sS -o /dev/null -w "attempt $n: HTTP %{http_code}\n" -H 'Content-Type: application/json' -d "{\"identifier\":\"admin@store.com\",\"password\":\"$PASSWORD\"}" "$BASE_URL/auth/login"; done
