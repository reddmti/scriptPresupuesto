import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

interface ClienteConfig {
  nombre: string;
  telefono: string;
  spreadsheetId: string;
  email_destino?: string[];
}

interface ClientesData {
  clientes: ClienteConfig[];
}

class ClienteManager {
  private clientesPath: string;
  private clientes: Map<string, ClienteConfig>;

  constructor() {
    this.clientesPath = path.join(process.cwd(), 'clientes.json');
    this.clientes = new Map();
    this.loadClientes();
  }

  /**
   * Carga el archivo clientes.json
   */
  private loadClientes(): void {
    try {
      if (!fs.existsSync(this.clientesPath)) {
        logger.warn('Archivo clientes.json no encontrado, creando vacío');
        this.saveClientes();
        return;
      }

      const data = fs.readFileSync(this.clientesPath, 'utf-8');
      const clientesData: ClientesData = JSON.parse(data);

      this.clientes.clear();
      clientesData.clientes.forEach((cliente) => {
        // Normalizar teléfono (quitar espacios, guiones, etc)
        const telefonoNormalizado = this.normalizarTelefono(cliente.telefono);
        this.clientes.set(telefonoNormalizado, cliente);
      });

      logger.info('Clientes cargados', { total: this.clientes.size });
    } catch (error) {
      logger.error('Error al cargar clientes.json', { error });
      this.clientes.clear();
    }
  }

  /**
   * Guarda clientes en el archivo JSON
   */
  private saveClientes(): void {
    try {
      const clientesArray = Array.from(this.clientes.values());
      const data: ClientesData = { clientes: clientesArray };
      fs.writeFileSync(this.clientesPath, JSON.stringify(data, null, 2), 'utf-8');
      logger.info('Clientes guardados', { total: clientesArray.length });
    } catch (error) {
      logger.error('Error al guardar clientes.json', { error });
    }
  }

  /**
   * Normaliza número de teléfono para comparación
   */
  private normalizarTelefono(telefono: string): string {
    // Quitar espacios, guiones, paréntesis, signos +
    return telefono.replace(/[\s\-\(\)\+]/g, '');
  }

  /**
   * Obtiene la configuración de un cliente por teléfono
   */
  getCliente(telefono: string): ClienteConfig | null {
    const telefonoNormalizado = this.normalizarTelefono(telefono);
    return this.clientes.get(telefonoNormalizado) || null;
  }

  /**
   * Obtiene el spreadsheetId de un cliente
   */
  getSpreadsheetId(telefono: string): string | null {
    const cliente = this.getCliente(telefono);
    return cliente?.spreadsheetId || null;
  }

  /**
   * Obtiene la URL completa del spreadsheet
   */
  getSpreadsheetUrl(telefono: string): string | null {
    const spreadsheetId = this.getSpreadsheetId(telefono);
    if (!spreadsheetId) return null;
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  }

  /**
   * Verifica si un cliente existe
   */
  existeCliente(telefono: string): boolean {
    const telefonoNormalizado = this.normalizarTelefono(telefono);
    return this.clientes.has(telefonoNormalizado);
  }

  /**
   * Recarga el archivo clientes.json (útil si se editó manualmente)
   */
  reload(): void {
    logger.info('Recargando clientes.json');
    this.loadClientes();
  }

  /**
   * Obtiene todos los clientes
   */
  getAllClientes(): ClienteConfig[] {
    return Array.from(this.clientes.values());
  }
}

export default new ClienteManager();
