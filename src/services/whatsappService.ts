import axios from 'axios';
import env from '../config/env';
import logger from '../utils/logger';

class WhatsAppService {
  // URL base para ENVIAR mensajes (usa Phone Number ID, no Business Account ID)
  private baseUrl = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}`;
  private headers = {
    'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };

  /**
   * Envía un mensaje de texto a WhatsApp
   */
  async sendMessage(to: string, message: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'text',
          text: { body: message },
        },
        { headers: this.headers }
      );

      logger.info('Mensaje enviado', { to, message: message.substring(0, 50) });
    } catch (error) {
      logger.error('Error al enviar mensaje', { error, to });
      throw error;
    }
  }

  /**
   * Envía un documento (PDF) a WhatsApp mediante upload
   */
  async sendDocument(to: string, pdfBuffer: Buffer, filename: string): Promise<void> {
    try {
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('messaging_product', 'whatsapp');
      formData.append('file', pdfBuffer, {
        filename: filename,
        contentType: 'application/pdf'
      });

      // 1. Subir el PDF y obtener el media ID
      const uploadResponse = await axios.post(
        `${this.baseUrl}/media`,
        formData,
        { 
          headers: {
            ...this.headers,
            ...formData.getHeaders()
          }
        }
      );

      const mediaId = uploadResponse.data.id;
      logger.info('PDF subido a WhatsApp', { mediaId, filename });

      // 2. Enviar el documento usando el media ID
      await axios.post(
        `${this.baseUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to: to,
          type: 'document',
          document: {
            id: mediaId,
            filename: filename,
            caption: '📄 Presupuesto generado'
          },
        },
        { headers: this.headers }
      );

      logger.info('Documento enviado', { to, filename });
    } catch (error) {
      logger.error('Error al enviar documento', { error, to });
      throw error;
    }
  }

  /**
   * Descarga un archivo multimedia de WhatsApp
   */
  async downloadMedia(mediaId: string): Promise<Buffer> {
    try {
      // 1. Obtener URL del medio
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        { headers: { 'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } }
      );

      const mediaUrl = mediaResponse.data.url;

      // 2. Descargar el archivo
      const fileResponse = await axios.get(mediaUrl, {
        headers: { 'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        responseType: 'arraybuffer',
      });

      logger.info('Media descargado', { mediaId });
      return Buffer.from(fileResponse.data);
    } catch (error) {
      logger.error('Error al descargar media', { error, mediaId });
      throw error;
    }
  }

  /**
   * Marca un mensaje como leído
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        },
        { headers: this.headers }
      );
    } catch (error) {
      logger.error('Error al marcar como leído', { error, messageId });
    }
  }
}

export default new WhatsAppService();
