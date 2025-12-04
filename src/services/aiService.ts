import OpenAI from 'openai';
import env from '../config/env';
import logger from '../utils/logger';
import { ExtractedIntent, UserContext } from '../types';

class AIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
  }

  /**
   * Extrae la intención y entidades de un mensaje del usuario
   */
  async extractIntent(message: string, context: UserContext): Promise<ExtractedIntent> {
    try {
      const systemPrompt = this.buildSystemPrompt(context);
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...context.recentMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })),
          { role: 'user', content: message }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      logger.info('Intención extraída', {
        phone: context.phone,
        intent: result.intent,
        entities: result.entities,
      });

      return result as ExtractedIntent;
    } catch (error) {
      logger.error('Error al extraer intención', { error, message });
      return {
        intent: 'desconocido',
        entities: {},
        confidence: 0,
        needsContext: true,
      };
    }
  }

  /**
   * Transcribe un audio a texto usando Whisper
   */
  async transcribeAudio(audioBuffer: Buffer, filename: string = 'audio.ogg'): Promise<string> {
    try {
      const file = new File([audioBuffer], filename, { type: 'audio/ogg' });
      
      const response = await this.client.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'es',
      });

      const rawText = response.text;
      logger.info('Audio transcrito (raw)', { text: rawText });
      
      // Limpiar la transcripción de forma conservadora
      const cleanedText = this.cleanTranscription(rawText);
      logger.info('Audio transcrito (limpio)', { text: cleanedText });
      
      return cleanedText;
    } catch (error) {
      logger.error('Error al transcribir audio', { error });
      throw new Error('No pude transcribir el audio');
    }
  }

  /**
   * Limpia la transcripción de audio sin inventar información
   * Solo normaliza formato y elimina ruido común
   * Preserva listas de items separadas por comas
   */
  private cleanTranscription(text: string): string {
    if (!text || text.trim() === '') return text;

    let cleaned = text;

    // 1. Eliminar muletillas comunes al inicio/final (SOLO si están aisladas)
    cleaned = cleaned.replace(/^(eh+|ah+|mm+|este|bueno|o sea)\s+/gi, '');
    cleaned = cleaned.replace(/\s+(eh+|ah+|mm+|este|bueno|o sea)$/gi, '');

    // 2. Eliminar sonidos de ruido (SOLO si están aislados, evitar entre comas)
    cleaned = cleaned.replace(/\b(uhm|umm|hmm|mhm)(?!\s*[,y])\b/gi, '');

    // 3. Normalizar espacios múltiples pero preservar comas
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.replace(/\s*,\s*/g, ', '); // Normalizar espacios alrededor de comas

    // 4. Trim final
    cleaned = cleaned.trim();

    // 5. Si la limpieza dejó el texto muy corto o vacío, devolver original
    if (cleaned.length < 3) {
      logger.warn('Limpieza resultó en texto muy corto, devolviendo original', { 
        original: text, 
        cleaned 
      });
      return text.trim();
    }

    // 6. Si se eliminó más del 50% del texto, devolver original (posible sobre-limpieza)
    if (cleaned.length < text.length * 0.5) {
      logger.warn('Limpieza eliminó demasiado texto, devolviendo original', { 
        original: text, 
        cleaned 
      });
      return text.trim();
    }

    return cleaned;
  }

  /**
   * Genera una respuesta conversacional para el usuario
   */
  async generateResponse(
    userMessage: string, 
    context: UserContext,
    actionResult: string
  ): Promise<string> {
    try {
      const systemPrompt = `Eres un asistente de WhatsApp que ayuda a crear presupuestos.
Responde de forma amigable, concisa y profesional.
Usa emojis moderadamente (✅, 📊, 💰, 📄).
Formatea las respuestas de manera clara.

Contexto actual:
- Presupuesto activo: ${context.activeSheetId || 'ninguno'}
- Resultado de la acción: ${actionResult}`;

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content || 'Entendido';
    } catch (error) {
      logger.error('Error al generar respuesta', { error });
      return '✅ Acción completada';
    }
  }

  private buildSystemPrompt(context: UserContext): string {
    return `Eres un sistema de clasificación de intenciones para un bot de presupuestos en WhatsApp.

Tu tarea es analizar el mensaje del usuario y extraer:
1. La intención principal
2. Las entidades relevantes (nombres, cantidades, precios)

Contexto del usuario:
- Presupuesto activo actual: ${context.activeSheetId || 'ninguno'}

Intenciones válidas:
- crear_presupuesto: Usuario quiere crear un nuevo presupuesto
- agregar_item: Usuario quiere agregar un ítem al presupuesto activo
- editar_item: Usuario quiere modificar un ítem existente
- eliminar_item: Usuario quiere borrar un ítem
- eliminar_presupuesto: Usuario quiere eliminar un presupuesto completo (aliases: "eliminar presupuesto", "borrar presupuesto", "eliminar hoja")
- confirmar_eliminacion: Usuario confirma que quiere eliminar (aliases: "si", "sí", "confirmar", "eliminar", "borrar", "ok")
- ver_items: Usuario quiere ver la lista de items del presupuesto activo (aliases: "ver items", "qué tengo", "qué hay", "lista", "mostrar items")
- ver_total: Usuario quiere ver el total y resumen del presupuesto (aliases: "total", "cuánto llevo", "cuánto va", "suma", "resumen")
- listar_presupuestos: Usuario quiere ver todos sus presupuestos
- cambiar_presupuesto: Usuario quiere trabajar con otro presupuesto
- descargar_presupuesto: Usuario quiere obtener el PDF
- consulta_general: Usuario hace una pregunta o consulta
- saludo: Usuario saluda o inicia conversación
- desconocido: No se puede determinar la intención

Entidades a extraer:
- nombrePresupuesto: nombre del presupuesto (string) - SOLO extraer si está EXPLÍCITAMENTE mencionado en el mensaje actual
- item: nombre del producto/servicio (string o array de strings para múltiples items)
- cantidad: cantidad numérica (number o array para múltiples items)
- precioUnitario: precio por unidad (number o array para múltiples items)
- numeroSeleccion: número de selección de lista (number) - IMPORTANTE: extraer cuando el usuario dice "eliminar item 2", "el número 3", "borrar el 1", etc.

IMPORTANTE:
- Si el mensaje incluye cantidad y precio, extrae ambos
- Los precios pueden estar escritos como "15000", "$15000", "15 mil", etc
- Las cantidades pueden ser "5", "cinco", "5 metros", etc
- Si el usuario menciona un número en contexto de eliminación/selección, extraerlo como numeroSeleccion
- Ejemplos de numeroSeleccion: "eliminar item 2" → 2, "el número 3" → 3, "borrar el primero" → 1
- NO extraer nombrePresupuesto del contexto o mensajes anteriores - SOLO si está en el mensaje actual
- Ejemplos: "cambiar" → sin nombrePresupuesto, "cambiar a casa ashly" → nombrePresupuesto: "casa ashly"
- MÚLTIPLES ITEMS: Si el mensaje contiene lista separada por comas, extraer arrays
- Ejemplo: "10 sacos cemento $8500, 5 kilos clavos $3000" → item: ["sacos cemento", "kilos clavos"], cantidad: [10, 5], precioUnitario: [8500, 3000]

Responde SIEMPRE en formato JSON con esta estructura:
{
  "intent": "nombre_intencion",
  "entities": {
    "nombrePresupuesto": "nombre si aplica",
    "item": "nombre del item si aplica",
    "cantidad": numero si aplica,
    "precioUnitario": numero si aplica,
    "numeroSeleccion": numero si aplica
  },
  "confidence": 0.95,
  "needsContext": false
}`;
  }
}

export default new AIService();
