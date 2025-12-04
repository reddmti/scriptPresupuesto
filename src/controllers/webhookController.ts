import { Request, Response } from 'express';
import budgetOrchestrator from '../services/budgetOrchestrator';
import whatsappService from '../services/whatsappService';
import aiService from '../services/aiService';
import env from '../config/env';
import logger from '../utils/logger';

class WebhookController {
  /**
   * Verificación del webhook (GET)
   * Meta envía esto para verificar que el webhook es válido
   */
  async verify(req: Request, res: Response): Promise<void> {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
      logger.info('Webhook verificado exitosamente');
      res.status(200).send(challenge);
    } else {
      logger.warn('Verificación de webhook fallida', { mode, token });
      res.sendStatus(403);
    }
  }

  /**
   * Recepción de mensajes (POST)
   * Meta envía los mensajes de WhatsApp aquí
   */
  async receiveMessage(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      // Responder rápido a Meta (200 OK)
      res.sendStatus(200);

      // Validar estructura del webhook
      if (!body.object || body.object !== 'whatsapp_business_account') {
        logger.warn('Webhook inválido recibido', { body });
        return;
      }

      // Procesar cada entrada
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;

          if (!value.messages) continue;

          // Procesar cada mensaje
          for (const message of value.messages) {
            await this.handleIncomingMessage(message, value.metadata);
          }
        }
      }
    } catch (error) {
      logger.error('Error en webhook', { error, body: req.body });
    }
  }

  /**
   * Maneja un mensaje individual entrante
   */
  private async handleIncomingMessage(message: any, _metadata: any): Promise<void> {
    try {
      const from = message.from; // Número del usuario
      const messageId = message.id;
      const type = message.type;

      logger.info('Mensaje recibido', { from, type, messageId });

      // Marcar como leído
      await whatsappService.markAsRead(messageId);

      let messageText = '';

      // Procesar según el tipo de mensaje
      switch (type) {
        case 'text':
          messageText = message.text.body;
          break;

        case 'audio':
          try {
            const audioBuffer = await whatsappService.downloadMedia(message.audio.id);
            messageText = await aiService.transcribeAudio(audioBuffer, 'audio.ogg');
            logger.info('Audio transcrito', { from, text: messageText });
          } catch (error) {
            logger.error('Error al transcribir audio', { error, from });
            await whatsappService.sendMessage(from, '❌ No pude procesar tu audio. Intenta con texto.');
            return;
          }
          break;

        case 'image':
        case 'document':
        case 'video':
          await whatsappService.sendMessage(
            from,
            '📎 Por ahora solo puedo procesar mensajes de texto y audio. Envíame un mensaje describiendo lo que necesitas.'
          );
          return;

        case 'button':
        case 'interactive':
          messageText = message.button?.text || message.interactive?.button_reply?.title || '';
          break;

        default:
          logger.warn('Tipo de mensaje no soportado', { type, from });
          return;
      }

      if (!messageText || messageText.trim() === '') {
        logger.warn('Mensaje vacío recibido', { from, type });
        return;
      }

      // Procesar el mensaje con el orquestador
      await budgetOrchestrator.processMessage(from, messageText);
    } catch (error) {
      logger.error('Error al manejar mensaje', { error, message });
    }
  }
}

export default new WebhookController();
