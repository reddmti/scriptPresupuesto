import aiService from './aiService';
import conversationManager from './conversationManager';
import sheetsService from './sheetsService';
import whatsappService from './whatsappService';
import pdfService from './pdfService';
import clienteManager from './clienteManager';
import priceService from './priceService';
import logger from '../utils/logger';
import { ExtractedIntent } from '../types';

class BudgetOrchestrator {
  /**
   * Procesa un mensaje del usuario y ejecuta la acción correspondiente
   */
  async processMessage(phone: string, message: string): Promise<void> {
    try {
      // 1. Guardar mensaje del usuario
      await conversationManager.saveMessage(phone, 'user', message);

      // 2. Obtener contexto del usuario
      const context = await conversationManager.getUserContext(phone);

      // 3. Extraer intención y entidades con IA
      const intent = await aiService.extractIntent(message, context);

      logger.info('Procesando mensaje', { phone, intent: intent.intent, entities: intent.entities });

      // 4. Ejecutar acción según intención
      const response = await this.executeAction(phone, intent, context);

      // 5. Guardar respuesta del bot
      await conversationManager.saveMessage(
        phone,
        'assistant',
        response,
        intent.intent,
        intent.entities
      );

      // 6. Enviar respuesta al usuario
      await whatsappService.sendMessage(phone, response);

      // 7. Limpiar mensajes antiguos (asíncrono)
      conversationManager.cleanOldMessages(phone).catch(() => {});
    } catch (error) {
      logger.error('Error al procesar mensaje', { error, phone, message });
      await whatsappService.sendMessage(
        phone,
        '❌ Ocurrió un error al procesar tu mensaje. Por favor, intenta de nuevo.'
      );
    }
  }

  /**
   * Ejecuta la acción correspondiente según la intención detectada
   */
  private async executeAction(
    phone: string,
    intent: ExtractedIntent,
    context: any
  ): Promise<string> {
    switch (intent.intent) {
      case 'saludo':
        return this.handleGreeting(phone);

      case 'crear_presupuesto':
        return this.handleCreateBudget(phone, intent, context);

      case 'agregar_item':
        return this.handleAddItem(phone, intent, context);

      case 'listar_presupuestos':
        return this.handleListBudgets(phone, context);

      case 'cambiar_presupuesto':
        return this.handleChangeBudget(phone, intent, context);

      case 'descargar_presupuesto':
        return this.handleDownloadBudget(phone, context);

      case 'editar_item':
        return '📝 La función de editar items está en desarrollo. Por ahora puedes eliminar y agregar de nuevo.';

      case 'eliminar_item':
        return this.handleDeleteItem(phone, intent, context);

      case 'eliminar_presupuesto':
        return this.handleDeleteBudget(phone, intent, context);

      case 'confirmar_eliminacion':
        return this.handleConfirmDelete(phone, context);

      case 'ver_items':
        return this.handleViewItems(phone, context);

      case 'ver_total':
        return this.handleViewTotal(phone, context);

      case 'consulta_general':
        return this.handleGeneralQuery(phone, context);

      default:
        let fallbackMsg = '';
        
        if (context.activeSheetId) {
          fallbackMsg += `📊 Presupuesto: "${context.activeSheetId}"\n\n`;
        }
        
        fallbackMsg += '🤔 No entendí.\n\n' +
               'Comandos:\n' +
               '• Agregar items\n' +
               '• Ver items\n' +
               '• Ver total\n' +
               '• Descargar PDF';
        
        return fallbackMsg;
    }
  }

  private async handleGreeting(phone: string): Promise<string> {
    const context = await conversationManager.getUserContext(phone);
    
    let greeting = '¡Hola! 👋 Soy tu asistente de presupuestos.\n\n';
    
    if (context.activeSheetId) {
      greeting += `📊 Presupuesto activo: "${context.activeSheetId}"\n\n`;
      greeting += 'Puedes:\n';
      greeting += '• Agregar items\n';
      greeting += '• Ver items\n';
      greeting += '• Ver total\n';
      greeting += '• Descargar PDF\n';
    } else {
      greeting += '¿Qué quieres hacer?\n';
      greeting += '• Crear presupuesto\n';
      greeting += '• Ver presupuestos\n';
    }
    
    return greeting;
  }

  private async handleCreateBudget(
    phone: string,
    intent: ExtractedIntent,
    context: any
  ): Promise<string> {
    const budgetName = intent.entities.nombrePresupuesto;

    if (!budgetName) {
      return '📊 ¿Cómo quieres llamar al nuevo presupuesto?\n\nEjemplo: "Remodelación cocina"';
    }

    try {
      // Si no tiene Google Sheet, buscar cliente en clientes.json
      if (!context.googleSheetUrl) {
        // Verificar si el cliente está registrado
        if (!clienteManager.existeCliente(phone)) {
          return '⚠️ Cliente no registrado.\n\n' +
                 'Contacta al administrador para configurar tu cuenta.';
        }

        // Obtener URL del spreadsheet del cliente
        const sheetUrl = clienteManager.getSpreadsheetUrl(phone);
        if (!sheetUrl) {
          return '⚠️ Error de configuración.\n\n' +
                 'Tu cuenta no tiene un spreadsheet asignado. Contacta al administrador.';
        }

        await conversationManager.setGoogleSheetUrl(phone, sheetUrl);
        context.googleSheetUrl = sheetUrl;
      }

      // Crear la hoja del presupuesto
      await sheetsService.createBudgetSheet(context.googleSheetUrl, budgetName);

      // Establecer como presupuesto activo
      await conversationManager.setActiveBudget(phone, budgetName);

      return `✅ Presupuesto "${budgetName}" creado\n\n` +
             `📋 Agrega items así:\n` +
             `   "10 sacos cemento"\n` +
             `   "5 metros cerámica a 12000" (precio opcional)\n\n` +
             `💡 items | total | cambiar presupuesto | pdf`;
    } catch (error: any) {
      logger.error('Error al crear presupuesto', { error, phone, budgetName });
      return `❌ ${error.message || 'No pude crear el presupuesto'}`;
    }
  }

  private async handleAddItem(
    phone: string,
    intent: ExtractedIntent,
    context: any
  ): Promise<string> {
    const { item, cantidad, precioUnitario, nombrePresupuesto } = intent.entities;

    // Si no hay Google Sheet, no puede agregar items
    if (!context.googleSheetUrl) {
      return '⚠️ Aún no tienes presupuestos.\n\n' +
             '📋 Estado actual: Sin presupuestos creados\n\n' +
             '¿Quieres crear tu primer presupuesto?';
    }

    // Si menciona un presupuesto específico, usarlo
    if (nombrePresupuesto) {
      try {
        const budgets = await sheetsService.listBudgets(context.googleSheetUrl);
        const matchingBudget = budgets.find(b => 
          b.toLowerCase().includes(nombrePresupuesto.toLowerCase())
        );

        if (matchingBudget) {
          await conversationManager.setActiveBudget(phone, matchingBudget);
          context.activeSheetId = matchingBudget;
        } else {
          return `❌ No encontré un presupuesto llamado "${nombrePresupuesto}".\n\n` +
                 `Tus presupuestos:\n${budgets.map((b, i) => `${i + 1}. ${b}`).join('\n')}`;
        }
      } catch (error) {
        logger.error('Error al buscar presupuesto', { error, phone });
      }
    }

    // Si pide agregar item pero no hay presupuesto activo, mostrar lista
    if (!context.activeSheetId) {
      try {
        const budgets = await sheetsService.listBudgets(context.googleSheetUrl);
        
        if (budgets.length === 0) {
          return '⚠️ No tienes presupuestos creados.\n\n¿Quieres crear uno?';
        }
        
        if (budgets.length === 1) {
          // Si solo hay uno, activarlo automáticamente
          await conversationManager.setActiveBudget(phone, budgets[0]);
          context.activeSheetId = budgets[0];
        } else {
          // Si hay varios, preguntar a cuál agregar
          let response = '📋 ¿A qué presupuesto quieres agregar el item?\n\n';
          budgets.forEach((budget, index) => {
            const active = budget === context.activeSheetId ? ' ✅ ACTIVO' : '';
            response += `${index + 1}. ${budget}${active}\n`;
          });
          
          if (context.activeSheetId) {
            response += `\n📊 Presupuesto actual: "${context.activeSheetId}"\n`;
          }
          
          response += '\n💡 Responde con el nombre o número del presupuesto';
          return response;
        }
      } catch (error) {
        logger.error('Error al listar presupuestos', { error, phone });
        return '❌ No pude obtener tus presupuestos';
      }
    }

    // Si aún falta información del item, pedirla
    if (!item || !cantidad) {
      let response = `📊 Presupuesto: "${context.activeSheetId}"\n\n`;
      response += 'Necesito:\n';
      
      if (!item) response += '• ❌ Producto\n';
      else response += `• ✅ Producto: ${Array.isArray(item) ? item.join(', ') : item}\n`;
      
      if (!cantidad) response += '• ❌ Cantidad\n';
      else response += `• ✅ Cantidad: ${Array.isArray(cantidad) ? cantidad.join(', ') : cantidad}\n`;
      
      response += '\nEjemplo: "15 metros cerámica" o "10 sacos cemento a $8500"';
      return response;
    }

    try {
      // Detectar si son múltiples items
      const isMultiple = Array.isArray(item);
      
      if (isMultiple) {
        // Agregar múltiples items
        const items = item as string[];
        const cantidades = Array.isArray(cantidad) ? cantidad : [cantidad];
        const precios = Array.isArray(precioUnitario) ? precioUnitario : [];
        
        let itemsAgregados = 0;
        const responses: string[] = [];
        
        for (let i = 0; i < items.length; i++) {
          const cant = cantidades[i] || cantidades[0];
          
          // Si no hay precio, obtenerlo con IA
          let precio: number;
          let priceSource = '';
          
          if (precios[i]) {
            precio = precios[i];
          } else {
            const priceResult = await priceService.getPrice(items[i]);
            precio = priceResult.price;
            priceSource = priceResult.source;
          }
          
          await sheetsService.addItem(context.googleSheetUrl, context.activeSheetId, {
            item: items[i],
            cantidad: cant,
            precioUnitario: precio,
            subtotal: cant * precio,
          });
          
          const priceLabel = priceSource ? ` (${priceSource})` : '';
          responses.push(`${items[i]}: ${cant} x $${precio.toLocaleString('es-CL')}${priceLabel}`);
          itemsAgregados++;
        }
        
        return `✅ ${itemsAgregados} items agregados\n\n` +
               `📊 Presupuesto: "${context.activeSheetId}"\n\n` +
               responses.join('\n');
      } else {
        // Agregar item individual
        const itemStr = item as string;
        const cant = cantidad as number;
        
        // Si no hay precio, obtenerlo con IA
        let precio: number;
        let priceSource = '';
        
        if (precioUnitario) {
          precio = precioUnitario as number;
        } else {
          await whatsappService.sendMessage(phone, '🔍 Buscando precio...');
          const priceResult = await priceService.getPrice(itemStr);
          precio = priceResult.price;
          priceSource = priceResult.source === 'Homecenter' ? 'precio Homecenter' : 'precio estimado';
        }
        
        await sheetsService.addItem(context.googleSheetUrl, context.activeSheetId, {
          item: itemStr,
          cantidad: cant,
          precioUnitario: precio,
          subtotal: cant * precio,
        });

        const subtotal = cant * precio;
        const priceLabel = priceSource ? ` (${priceSource})` : '';

        return `✅ Item agregado\n\n` +
               `📊 Presupuesto: "${context.activeSheetId}"\n` +
               `📦 ${itemStr}\n` +
               `   Cantidad: ${cant}\n` +
               `   Precio: $${precio.toLocaleString('es-CL')}${priceLabel}\n` +
               `   Subtotal: $${subtotal.toLocaleString('es-CL')}`;
      }
    } catch (error: any) {
      logger.error('Error al agregar item', { error, phone });
      return `❌ ${error.message || 'No pude agregar el item'}`;
    }
  }

  private async handleListBudgets(phone: string, context: any): Promise<string> {
    if (!context.googleSheetUrl) {
      return '📋 Aún no tienes presupuestos creados.\n\n¿Quieres crear uno?';
    }

    try {
      const budgets = await sheetsService.listBudgets(context.googleSheetUrl);

      if (budgets.length === 0) {
        return '📋 No tienes presupuestos creados aún.\n\n¿Quieres crear uno?';
      }

      let response = '📋 Tus presupuestos:\n\n';
      budgets.forEach((budget, index) => {
        const active = budget === context.activeSheetId ? ' ✅ ACTIVO' : '';
        response += `${index + 1}. ${budget}${active}\n`;
      });

      if (!context.activeSheetId) {
        response += '\n💡 Usa "cambiar presupuesto"';
      }

      return response;
    } catch (error: any) {
      logger.error('Error al listar presupuestos', { error, phone });
      return `❌ ${error.message || 'No pude obtener tus presupuestos'}`;
    }
  }

  private async handleChangeBudget(
    phone: string,
    intent: ExtractedIntent,
    context: any
  ): Promise<string> {
    const budgetName = intent.entities.nombrePresupuesto;

    try {
      // Obtener lista de presupuestos
      const budgets = await sheetsService.listBudgets(context.googleSheetUrl);
      
      if (!budgetName) {
        // Mostrar lista de presupuestos disponibles
        let response = '📊 ¿A qué presupuesto quieres cambiar?\n\n';
        response += 'Tus presupuestos:\n\n';
        budgets.forEach((budget, index) => {
          const isActive = budget === context.activeSheetId;
          response += `${index + 1}. ${budget}${isActive ? ' ✅ ACTIVO' : ''}\n`;
        });
        response += '\n💡 Dime el nombre del presupuesto';
        return response;
      }

      const matchingBudget = budgets.find(b => 
        b.toLowerCase().includes(budgetName.toLowerCase())
      );

      if (!matchingBudget) {
        let response = `❌ No encontré un presupuesto llamado "${budgetName}".\n\n`;
        response += 'Tus presupuestos:\n\n';
        budgets.forEach((budget, index) => {
          const isActive = budget === context.activeSheetId;
          response += `${index + 1}. ${budget}${isActive ? ' ✅ ACTIVO' : ''}\n`;
        });
        return response;
      }

      await conversationManager.setActiveBudget(phone, matchingBudget);

      return `✅ Presupuesto cambiado\n\n` +
             `📊 Ahora trabajas en: "${matchingBudget}"`;
    } catch (error: any) {
      logger.error('Error al cambiar presupuesto', { error, phone });
      return `❌ ${error.message || 'No pude cambiar de presupuesto'}`;
    }
  }

  private async handleDownloadBudget(phone: string, context: any): Promise<string> {
    if (!context.activeSheetId) {
      return '⚠️ No tienes un presupuesto activo seleccionado.\n\n' +
             '📋 Usa "ver mis presupuestos" para ver la lista y seleccionar uno.';
    }

    try {
      // Generar PDF
      await whatsappService.sendMessage(phone, '⏳ Generando tu presupuesto en PDF...');
      
      const pdfBuffer = await pdfService.generateBudgetPDF(
        context.googleSheetUrl,
        context.activeSheetId,
        phone
      );

      // Enviar PDF
      const filename = `Presupuesto_${context.activeSheetId.replace(/\s+/g, '_')}.pdf`;
      await whatsappService.sendDocument(phone, pdfBuffer, filename);

      return `✅ PDF enviado exitosamente\n\n` +
             `📊 Presupuesto: "${context.activeSheetId}"`;
    } catch (error: any) {
      logger.error('Error al generar PDF', { error, phone });
      return `❌ No pude generar el PDF en este momento.\n\n` +
             `Por favor intenta nuevamente.`;
    }
  }

  private async handleDeleteItem(
    phone: string,
    intent: ExtractedIntent,
    context: any
  ): Promise<string> {
    if (!context.activeSheetId) {
      return '⚠️ No tienes un presupuesto activo.\n\n' +
             '📋 Usa "ver presupuestos" para seleccionar uno.';
    }

    try {
      // Obtener items del presupuesto
      const items = await sheetsService.getBudgetItems(context.googleSheetUrl, context.activeSheetId);

      if (items.length === 0) {
        return `📊 Presupuesto: "${context.activeSheetId}"\n\n` +
               '📭 Este presupuesto está vacío. No hay items para eliminar.';
      }

      // Si mencionó un número de selección, usar ese
      const numeroSeleccion = intent.entities.numeroSeleccion;
      
      if (numeroSeleccion && numeroSeleccion >= 1 && numeroSeleccion <= items.length) {
        // Eliminar el item
        await sheetsService.deleteItem(context.googleSheetUrl, context.activeSheetId, numeroSeleccion);
        
        const deletedItem = items[numeroSeleccion - 1];
        return `✅ Item eliminado\n\n` +
               `📊 Presupuesto: "${context.activeSheetId}"\n\n` +
               `🗑️ ${deletedItem.item}\n` +
               `   $${deletedItem.subtotal.toLocaleString('es-CL')}`;
      }

      // Si no especificó número, mostrar lista para que seleccione
      let response = `📊 Presupuesto: "${context.activeSheetId}"\n\n`;
      response += '¿Qué item eliminar?\n\n';
      
      items.forEach((item, index) => {
        response += `${index + 1}. ${item.item} - $${item.subtotal.toLocaleString('es-CL')}\n`;
      });

      response += '\nEjemplo: "eliminar 2"';

      return response;
    } catch (error: any) {
      logger.error('Error al eliminar item', { error, phone });
      return `❌ ${error.message || 'No pude eliminar el item'}`;
    }
  }

  private async handleConfirmDelete(
    phone: string,
    context: any
  ): Promise<string> {
    try {
      // Buscar mensaje de confirmación pendiente
      const recentMessages = context.recentMessages || [];
      const pendingDelete = recentMessages.find((m: any) => 
        m.role === 'assistant' && m.content.startsWith('PENDING_DELETE:')
      );

      if (!pendingDelete) {
        return '⚠️ No hay ninguna eliminación pendiente de confirmar.';
      }

      const budgetToDelete = pendingDelete.content.replace('PENDING_DELETE:', '');

      // Eliminar el presupuesto
      await sheetsService.deleteBudgetSheet(context.googleSheetUrl, budgetToDelete);

      // Si era el presupuesto activo, limpiarlo
      if (context.activeSheetId === budgetToDelete) {
        await conversationManager.setActiveBudget(phone, null);
      }

      return `✅ Presupuesto "${budgetToDelete}" eliminado correctamente.`;
    } catch (error: any) {
      logger.error('Error al confirmar eliminación', { error, phone });
      return `❌ ${error.message || 'No pude eliminar el presupuesto'}`;
    }
  }

  private async handleDeleteBudget(
    phone: string,
    intent: ExtractedIntent,
    context: any
  ): Promise<string> {
    if (!context.googleSheetUrl) {
      return '⚠️ No tienes presupuestos creados.';
    }

    try {
      const budgets = await sheetsService.listBudgets(context.googleSheetUrl);

      if (budgets.length === 0) {
        return '📋 No tienes presupuestos para eliminar.';
      }

      const budgetName = intent.entities.nombrePresupuesto;

      if (!budgetName) {
        let response = '⚠️ ¿Qué presupuesto quieres eliminar?\n\n';
        budgets.forEach((budget, index) => {
          const isActive = budget === context.activeSheetId;
          response += `${index + 1}. ${budget}${isActive ? ' ✅ ACTIVO' : ''}\n`;
        });
        response += '\n💡 Dime el nombre del presupuesto a eliminar';
        return response;
      }

      const matchingBudget = budgets.find(b => 
        b.toLowerCase().includes(budgetName.toLowerCase())
      );

      if (!matchingBudget) {
        let response = `❌ No encontré un presupuesto llamado "${budgetName}".\n\n`;
        response += 'Tus presupuestos:\n';
        budgets.forEach((budget, index) => {
          response += `${index + 1}. ${budget}\n`;
        });
        return response;
      }

      // Obtener resumen del presupuesto para confirmación
      try {
        const items = await sheetsService.getBudgetItems(context.googleSheetUrl, matchingBudget);
        const total = items.reduce((sum, item) => sum + item.subtotal, 0);
        
        // Guardar presupuesto pendiente de eliminar en contexto (como mensaje del bot)
        await conversationManager.saveMessage(phone, 'assistant', `PENDING_DELETE:${matchingBudget}`);
        
        return `⚠️ ¿Seguro que quieres eliminar "${matchingBudget}"?\n\n` +
               `📊 ${items.length} items · $${total.toLocaleString('es-CL')}\n\n` +
               `Responde SI para confirmar`;
      } catch (error) {
        logger.error('Error al obtener info del presupuesto', { error });
        return '❌ No pude obtener información del presupuesto';
      }
    } catch (error: any) {
      logger.error('Error al eliminar presupuesto', { error, phone });
      return `❌ ${error.message || 'No pude eliminar el presupuesto'}`;
    }
  }

  private async handleViewItems(phone: string, context: any): Promise<string> {
    if (!context.activeSheetId) {
      return '⚠️ No tienes un presupuesto activo.\n\n' +
             '📋 Usa "ver presupuestos" para seleccionar uno.';
    }

    try {
      const items = await sheetsService.getBudgetItems(context.googleSheetUrl, context.activeSheetId);

      if (items.length === 0) {
        return `📊 Presupuesto: "${context.activeSheetId}"\n\n` +
               '📭 Este presupuesto está vacío.\n\n' +
               'Agrega items con:\n' +
               '"10 sacos de cemento a $8500"';
      }

      let response = `📊 "${context.activeSheetId}"\n\n`;
      response += `Items (${items.length}):\n\n`;
      
      items.forEach((item, index) => {
        response += `${index + 1}. ${item.item}\n`;
        response += `   ${item.cantidad} x $${item.precioUnitario.toLocaleString('es-CL')} = $${item.subtotal.toLocaleString('es-CL')}\n\n`;
      });

      const total = items.reduce((sum, item) => sum + item.subtotal, 0);
      response += `💰 Total: $${total.toLocaleString('es-CL')}`;

      return response;
    } catch (error: any) {
      logger.error('Error al ver items', { error, phone });
      return `❌ ${error.message || 'No pude obtener los items'}`;
    }
  }

  private async handleViewTotal(phone: string, context: any): Promise<string> {
    if (!context.activeSheetId) {
      return '⚠️ No tienes un presupuesto activo.\n\n' +
             '📋 Usa "ver presupuestos" para seleccionar uno.';
    }

    try {
      const items = await sheetsService.getBudgetItems(context.googleSheetUrl, context.activeSheetId);

      if (items.length === 0) {
        return `📊 Presupuesto: "${context.activeSheetId}"\n\n` +
               '📭 Este presupuesto está vacío. Total: $0';
      }

      const total = items.reduce((sum, item) => sum + item.subtotal, 0);
      const itemMasCaro = items.reduce((max, item) => 
        item.subtotal > max.subtotal ? item : max
      );
      const itemMasBarato = items.reduce((min, item) => 
        item.subtotal < min.subtotal ? item : min
      );
      const promedio = total / items.length;

      let response = `📊 "${context.activeSheetId}"\n\n`;
      response += `💰 TOTAL: $${total.toLocaleString('es-CL')}\n\n`;
      response += `${items.length} items\n`;
      response += `Promedio: $${Math.round(promedio).toLocaleString('es-CL')}\n\n`;
      response += `Más caro: ${itemMasCaro.item} ($${itemMasCaro.subtotal.toLocaleString('es-CL')})\n`;
      response += `Más barato: ${itemMasBarato.item} ($${itemMasBarato.subtotal.toLocaleString('es-CL')})`;

      return response;
    } catch (error: any) {
      logger.error('Error al ver total', { error, phone });
      return `❌ ${error.message || 'No pude calcular el total'}`;
    }
  }

  private async handleGeneralQuery(_phone: string, context: any): Promise<string> {
    let response = '';
    
    if (context.activeSheetId) {
      response += `📊 Presupuesto: "${context.activeSheetId}"\n\n`;
      response += 'Comandos:\n\n';
      response += '• Agregar items\n';
      response += '• Ver items\n';
      response += '• Ver total\n';
      response += '• Eliminar item\n';
      response += '• Descargar PDF\n';
      response += '• Cambiar presupuesto\n';
    } else {
      response += 'Sin presupuesto activo\n\n' +
             '¿Qué quieres hacer?\n\n' +
             '• Crear presupuesto\n' +
             '• Ver presupuestos\n';
    }
    
    return response;
  }
}

export default new BudgetOrchestrator();
