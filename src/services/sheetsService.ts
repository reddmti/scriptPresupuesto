import { google } from 'googleapis';
import env from '../config/env';
import logger from '../utils/logger';
import { BudgetItem } from '../types';

class SheetsService {
  private sheets;
  private drive;

  constructor() {
    let authConfig: any;
    
    // Priorizar Base64 de variable de entorno (para Railway/producción)
    if (env.GOOGLE_SERVICE_ACCOUNT_BASE64) {
      const jsonString = Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
      const credentials = JSON.parse(jsonString);
      authConfig = {
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
        ],
      };
    } else {
      throw new Error('No se configuró GOOGLE_SERVICE_ACCOUNT_BASE64');
    }

    const auth = new google.auth.GoogleAuth(authConfig);

    this.sheets = google.sheets({ version: 'v4', auth });
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Crea un archivo de Google Sheets para un cliente
   */
  async createUserSpreadsheet(phone: string): Promise<string> {
    try {
      // Crear archivo usando Drive API para poder especificar la carpeta padre
      const fileMetadata: any = {
        name: `Presupuestos_${phone}`,
        mimeType: 'application/vnd.google-apps.spreadsheet',
      };

      // Si hay carpeta configurada, crear el archivo directamente ahí
      if (env.GOOGLE_PARENT_FOLDER_ID) {
        fileMetadata.parents = [env.GOOGLE_PARENT_FOLDER_ID];
        logger.info('Creando archivo en carpeta compartida', { phone, folderId: env.GOOGLE_PARENT_FOLDER_ID });
      }

      const driveResponse = await this.drive.files.create({
        requestBody: fileMetadata,
        fields: 'id',
      });

      const spreadsheetId = driveResponse.data.id!;

      // Ahora configurar el contenido del spreadsheet
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            updateSheetProperties: {
              properties: {
                sheetId: 0,
                title: 'Información',
                gridProperties: { frozenRowCount: 1 },
              },
              fields: 'title,gridProperties.frozenRowCount',
            },
          }],
        },
      });

      // Agregar contenido inicial
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Información!A1:B1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Archivo de presupuestos', `Cliente: ${phone}`]],
        },
      });

      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      // Hacer el archivo accesible (cualquiera con el link puede ver)
      await this.drive.permissions.create({
        fileId: spreadsheetId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      logger.info('Spreadsheet creado', { phone, spreadsheetId });
      return spreadsheetUrl;
    } catch (error) {
      logger.error('Error al crear spreadsheet', { error, phone });
      throw new Error('No pude crear el archivo de presupuestos');
    }
  }

  /**
   * Crea una nueva hoja (presupuesto) dentro del archivo del usuario
   */
  async createBudgetSheet(spreadsheetUrl: string, budgetName: string): Promise<void> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: budgetName,
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            },
          ],
        },
      });

      // Agregar encabezados
      await this.sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${budgetName}!A1:E1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Item', 'Cantidad', 'Precio Unitario', 'Subtotal', 'Notas']],
        },
      });

      // Formatear encabezados (negrita)
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: await this.getSheetId(spreadsheetId, budgetName),
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true },
                    backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
                  },
                },
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
              },
            },
          ],
        },
      });

      logger.info('Hoja de presupuesto creada', { budgetName });
    } catch (error: any) {
      logger.error('Error al crear hoja', { error, budgetName });
      
      // Verificar si es error de hoja duplicada
      if (error?.message?.includes('already exists')) {
        throw new Error(`Ya existe un presupuesto llamado "${budgetName}". Prueba con otro nombre o agrega un número (ej: "${budgetName} 2")`);
      }
      
      throw new Error(`No pude crear el presupuesto "${budgetName}"`);
    }
  }

  /**
   * Agrega un item al presupuesto
   */
  async addItem(
    spreadsheetUrl: string,
    budgetName: string,
    item: BudgetItem
  ): Promise<void> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);

      await this.sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${budgetName}!A:E`,
        valueInputOption: 'USER_ENTERED', // Para que las fórmulas funcionen
        requestBody: {
          values: [[
            item.item,
            item.cantidad,
            item.precioUnitario,
            `=B${await this.getNextRow(spreadsheetId, budgetName)}*C${await this.getNextRow(spreadsheetId, budgetName)}`,
            item.notas || '',
          ]],
        },
      });

      logger.info('Item agregado', { budgetName, item: item.item });
    } catch (error) {
      logger.error('Error al agregar item', { error, budgetName });
      throw new Error('No pude agregar el item');
    }
  }

  /**
   * Lista todas las hojas (presupuestos) de un archivo
   */
  async listBudgets(spreadsheetUrl: string): Promise<string[]> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);

      const response = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheets = response.data.sheets || [];

      return sheets
        .map(sheet => sheet.properties?.title || '')
        .filter(title => title !== 'Información');
    } catch (error) {
      logger.error('Error al listar presupuestos', { error });
      throw new Error('No pude obtener tus presupuestos');
    }
  }

  /**
   * Obtiene todos los items de un presupuesto
   */
  async getBudgetItems(spreadsheetUrl: string, budgetName: string): Promise<BudgetItem[]> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${budgetName}!A2:E`,
      });

      const rows = response.data.values || [];
      
      return rows.map(row => ({
        item: row[0] || '',
        cantidad: Number(row[1]) || 0,
        precioUnitario: Number(row[2]) || 0,
        subtotal: Number(row[3]) || 0,
        notas: row[4] || '',
      }));
    } catch (error) {
      logger.error('Error al obtener items', { error, budgetName });
      throw new Error('No pude obtener los items del presupuesto');
    }
  }

  /**
   * Elimina un item del presupuesto por número de fila
   */
  async deleteItem(spreadsheetUrl: string, budgetName: string, rowNumber: number): Promise<void> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);
      const sheetId = await this.getSheetId(spreadsheetId, budgetName);

      // rowNumber viene como 1-indexed desde la UI (item #1, #2, etc.)
      // Los headers están en row 0, los datos empiezan en row 1
      // Entonces el item #1 está en la fila 2 de la hoja (index 1)
      const actualRowIndex = rowNumber; // row 1 en la hoja (después del header)

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: actualRowIndex,
                endIndex: actualRowIndex + 1,
              },
            },
          }],
        },
      });

      logger.info('Item eliminado', { budgetName, rowNumber });
    } catch (error) {
      logger.error('Error al eliminar item', { error, budgetName, rowNumber });
      throw new Error('No pude eliminar el item');
    }
  }

  /**
   * Elimina un presupuesto completo (sheet)
   */
  async deleteBudgetSheet(spreadsheetUrl: string, budgetName: string): Promise<void> {
    try {
      const spreadsheetId = this.extractSpreadsheetId(spreadsheetUrl);
      const sheetId = await this.getSheetId(spreadsheetId, budgetName);

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteSheet: {
                sheetId,
              },
            },
          ],
        },
      });

      logger.info('Presupuesto eliminado', { budgetName });
    } catch (error: any) {
      logger.error('Error al eliminar presupuesto', { error, budgetName });
      throw new Error('No pude eliminar el presupuesto');
    }
  }

  // Métodos auxiliares
  private extractSpreadsheetId(url: string): string {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) throw new Error('URL de spreadsheet inválida');
    return match[1];
  }

  private async getSheetId(spreadsheetId: string, sheetName: string): Promise<number> {
    const response = await this.sheets.spreadsheets.get({ spreadsheetId });
    const sheet = response.data.sheets?.find(s => s.properties?.title === sheetName);
    return sheet?.properties?.sheetId || 0;
  }

  private async getNextRow(spreadsheetId: string, sheetName: string): Promise<number> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:A`,
    });
    return (response.data.values?.length || 1) + 1;
  }
}

export default new SheetsService();
