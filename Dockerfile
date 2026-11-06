# Aura Health Journal — imagem estática (nginx)
#
#   node tools/empacotar.mjs
#   docker build -t aura .
#   docker run --rm -p 8080:80 aura     → http://localhost:8080
#
# Para instalar no iPhone é preciso HTTPS público: ponha esta imagem atrás de
# um proxy com certificado (Caddy, Traefik, Cloudflare Tunnel) ou use um
# hosting estático — ver README.md.

FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/site/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
