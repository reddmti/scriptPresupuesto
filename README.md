# 🤖 WhatsApp Budget Bot

Bot de WhatsApp para gestión de presupuestos con IA.

## 🚀 Características

- Conversación natural con IA
- Gestión de presupuestos en Google Sheets
- Agregar items con cantidad y precio
- Generar PDF de presupuestos
- Soporte para mensajes de voz
- Múltiples presupuestos por usuario

## 📦 Instalación

```bash
npm install
npm run build
```

## ⚙️ Configuración

1. Copiar `.env.example` a `.env`
2. Completar todas las variables de entorno
3. Colocar `credentials.json` de Google Service Account en la raíz
4. Ejecutar migraciones: `npm run prisma:migrate`

## 🏃 Ejecutar

```bash
npm start
```

## 🔗 Webhook

Configurar en WhatsApp Business API:
- URL: `https://tu-dominio.com/webhook`
- Verify Token: El mismo de `.env`
