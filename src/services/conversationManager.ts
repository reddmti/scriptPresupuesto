import prisma from '../config/database';
import { UserContext } from '../types';
import logger from '../utils/logger';

class ConversationManager {
  /**
   * Obtiene o crea un usuario en la base de datos
   */
  async getOrCreateUser(phone: string): Promise<{
    id: string;
    phone: string;
    activeSheetId: string | null;
    googleSheetUrl: string | null;
  }> {
    try {
      let user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        user = await prisma.user.create({
          data: { phone },
        });
        logger.info('Nuevo usuario creado', { phone });
      }

      return user;
    } catch (error) {
      logger.error('Error al obtener usuario', { error, phone });
      throw error;
    }
  }

  /**
   * Guarda un mensaje en el historial
   */
  async saveMessage(
    phone: string,
    role: 'user' | 'assistant',
    content: string,
    intent?: string,
    entities?: any
  ): Promise<void> {
    try {
      const user = await this.getOrCreateUser(phone);

      await prisma.message.create({
        data: {
          userId: user.id,
          role,
          content,
          intent,
          entities: entities || undefined,
        },
      });

      logger.debug('Mensaje guardado', { phone, role, intent });
    } catch (error) {
      logger.error('Error al guardar mensaje', { error, phone });
    }
  }

  /**
   * Obtiene el contexto completo del usuario
   */
  async getUserContext(phone: string): Promise<UserContext> {
    try {
      const user = await this.getOrCreateUser(phone);

      // Obtener últimos 10 mensajes
      const messages = await prisma.message.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: { role: true, content: true },
      });

      return {
        phone: user.phone,
        activeSheetId: user.activeSheetId,
        googleSheetUrl: user.googleSheetUrl,
        recentMessages: messages.reverse(), // Ordenar del más antiguo al más reciente
      };
    } catch (error) {
      logger.error('Error al obtener contexto', { error, phone });
      throw error;
    }
  }

  /**
   * Actualiza el presupuesto activo del usuario
   */
  async setActiveBudget(phone: string, budgetName: string | null): Promise<void> {
    try {
      const user = await this.getOrCreateUser(phone);

      await prisma.user.update({
        where: { id: user.id },
        data: { activeSheetId: budgetName },
      });

      logger.info('Presupuesto activo actualizado', { phone, budgetName });
    } catch (error) {
      logger.error('Error al actualizar presupuesto activo', { error, phone });
      throw error;
    }
  }

  /**
   * Guarda la URL del Google Sheet del usuario
   */
  async setGoogleSheetUrl(phone: string, url: string): Promise<void> {
    try {
      const user = await this.getOrCreateUser(phone);

      await prisma.user.update({
        where: { id: user.id },
        data: { googleSheetUrl: url },
      });

      logger.info('Google Sheet URL guardada', { phone });
    } catch (error) {
      logger.error('Error al guardar Google Sheet URL', { error, phone });
      throw error;
    }
  }

  /**
   * Limpia mensajes antiguos (mantener últimos 50)
   */
  async cleanOldMessages(phone: string): Promise<void> {
    try {
      const user = await this.getOrCreateUser(phone);

      const messages = await prisma.message.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: 'desc' },
        select: { id: true },
      });

      if (messages.length > 50) {
        const idsToDelete = messages.slice(50).map(m => m.id);
        
        await prisma.message.deleteMany({
          where: { id: { in: idsToDelete } },
        });

        logger.debug('Mensajes antiguos eliminados', { phone, count: idsToDelete.length });
      }
    } catch (error) {
      logger.error('Error al limpiar mensajes', { error, phone });
    }
  }
}

export default new ConversationManager();
