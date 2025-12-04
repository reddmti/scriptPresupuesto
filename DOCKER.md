# WhatsApp Budget Bot - Docker

Bot de presupuestos para WhatsApp con IA, Google Sheets y PostgreSQL.

## 🚀 Despliegue Rápido

### Prerequisitos
- Docker y Docker Compose instalados
- Archivo `.env` con variables de entorno
- `clientes.json` con configuración de clientes
- Cuenta WhatsApp Business API configurada
- Base de datos PostgreSQL (Aiven/Render/Supabase)

### Instalación

1. **Clonar repositorio:**
```bash
git clone <tu-repo>
cd scriptPresupuesto
```

2. **Crear archivo `.env`:**
```env
# Base de datos
DATABASE_URL=postgresql://user:pass@host:port/database

# OpenAI
OPENAI_API_KEY=sk-...

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=814084751799492
WHATSAPP_ACCESS_TOKEN=EAAMN4gx5Mfw...
WHATSAPP_VERIFY_TOKEN=mi_token_secreto

# Google Sheets (en base64)
GOOGLE_SERVICE_ACCOUNT_BASE64=eyJ0eXBlIjoi...
```

3. **Configurar clientes:**
```bash
cp clientes.json.example clientes.json
nano clientes.json
```

4. **Levantar con Docker:**
```bash
# Compilar y levantar
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down
```

## 📦 Comandos Docker

```bash
# Build manual
docker build -t whatsapp-bot .

# Correr sin compose
docker run -d \
  --name whatsapp-bot \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/clientes.json:/app/clientes.json \
  whatsapp-bot

# Ver logs
docker logs -f whatsapp-bot

# Reiniciar
docker restart whatsapp-bot

# Detener y eliminar
docker stop whatsapp-bot
docker rm whatsapp-bot
```

## 🔄 Actualizar

```bash
# Pull últimos cambios
git pull

# Rebuild y reiniciar
docker-compose up -d --build
```

## 🌐 Subir a Docker Hub

```bash
# Login
docker login

# Tag
docker tag whatsapp-bot tu-usuario/whatsapp-presupuestos:latest

# Push
docker push tu-usuario/whatsapp-presupuestos:latest
```

## 📋 Variables de Entorno

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | URL de PostgreSQL |
| `OPENAI_API_KEY` | API Key de OpenAI |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de WhatsApp |
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso de WhatsApp |
| `WHATSAPP_VERIFY_TOKEN` | Token de verificación webhook |
| `GOOGLE_SERVICE_ACCOUNT_BASE64` | Credenciales Google (base64) |

## 🏥 Health Check

```bash
curl http://localhost:3000/health
```

## 🔧 Troubleshooting

**Bot no inicia:**
```bash
docker-compose logs whatsapp-bot
```

**Reiniciar desde cero:**
```bash
docker-compose down -v
docker-compose up -d --build
```

**Ver recursos:**
```bash
docker stats whatsapp-bot
```
