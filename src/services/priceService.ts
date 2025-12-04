import OpenAI from 'openai';
import env from '../config/env';
import logger from '../utils/logger';

class PriceService {
  private client: OpenAI;
  private priceCache: Map<string, { price: number; timestamp: number }>;
  private CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    this.priceCache = new Map();
  }

  /**
   * Obtiene el precio de un producto usando IA
   * Prioriza Homecenter Chile, luego mercado general
   */
  async getPrice(itemName: string): Promise<{ price: number; source: string }> {
    try {
      // Normalizar nombre para cache
      const cacheKey = itemName.toLowerCase().trim();
      
      // Verificar cache
      const cached = this.priceCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        logger.info('Precio obtenido del cache', { item: itemName, price: cached.price });
        return { price: cached.price, source: 'cache' };
      }

      // Consultar a GPT-4 por precio
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en precios de materiales de construcción en Chile.
Tu trabajo es estimar el precio UNITARIO actual de productos basándote en:
1. Homecenter Chile (prioridad)
2. Sodimac Chile
3. Precios promedio del mercado chileno

IMPORTANTE:
- Responde SOLO con el número del precio en pesos chilenos
- Precio UNITARIO (por unidad, no total)
- Sin puntos, sin comas, sin símbolos
- Ejemplos: 8500, 12000, 45000
- Si es por metro/kilo/litro, dar precio por esa unidad
- Precios realistas de 2025 en Chile

Ejemplos:
Input: "saco de cemento"
Output: 8500

Input: "metro de cerámica"
Output: 12000

Input: "litro de pintura"
Output: 15000`
          },
          {
            role: 'user',
            content: `¿Cuál es el precio unitario actual de: ${itemName}?`
          }
        ],
        temperature: 0.3,
        max_tokens: 20,
      });

      const priceText = response.choices[0].message.content?.trim() || '0';
      const price = parseInt(priceText.replace(/[^\d]/g, ''));

      if (!price || price === 0) {
        logger.warn('No se pudo obtener precio, usando default', { item: itemName });
        return { price: 1000, source: 'default' };
      }

      // Guardar en cache
      this.priceCache.set(cacheKey, { price, timestamp: Date.now() });

      logger.info('Precio estimado con IA', { item: itemName, price, source: 'Homecenter' });
      
      return { price, source: 'Homecenter' };
    } catch (error) {
      logger.error('Error al obtener precio', { error, item: itemName });
      return { price: 1000, source: 'default' };
    }
  }

  /**
   * Limpia cache de precios antiguos
   */
  clearOldCache(): void {
    const now = Date.now();
    for (const [key, value] of this.priceCache.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.priceCache.delete(key);
      }
    }
    logger.info('Cache de precios limpiado');
  }
}

export default new PriceService();
