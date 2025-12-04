import puppeteer from 'puppeteer';
import logger from '../utils/logger';
import sheetsService from './sheetsService';
import clienteManager from './clienteManager';

class PDFService {
  /**
   * Genera un PDF de un presupuesto desde Google Sheets
   */
  async generateBudgetPDF(
    spreadsheetUrl: string,
    budgetName: string,
    phone: string
  ): Promise<Buffer> {
    let browser;
    
    try {
      // Obtener los items del presupuesto
      const items = await sheetsService.getBudgetItems(spreadsheetUrl, budgetName);
      
      if (items.length === 0) {
        throw new Error('El presupuesto está vacío');
      }

      // Calcular total
      const total = items.reduce((sum, item) => sum + item.subtotal, 0);

      // Obtener información del cliente
      const cliente = clienteManager.getCliente(phone);

      // Generar HTML del presupuesto
      const html = this.generateHTML(budgetName, items, total, cliente);

      // Lanzar navegador headless
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      
      // Cargar el HTML
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generar PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      logger.info('PDF generado exitosamente', { budgetName });
      
      return Buffer.from(pdfBuffer);
    } catch (error) {
      logger.error('Error al generar PDF', { error, budgetName });
      throw new Error('No pude generar el PDF');
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private generateHTML(
    budgetName: string,
    items: Array<{ item: string; cantidad: number; precioUnitario: number; subtotal: number }>,
    total: number,
    cliente: any
  ): string {
    const today = new Date().toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Información del cliente
    const clienteNombre = cliente?.nombre || 'Cliente';
    const clienteTelefono = cliente?.telefono || '';
    const clienteEmail = cliente?.email_destino?.[0] || '';

    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Presupuesto - ${budgetName}</title>
  <style>
    @page {
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #2c3e50;
      background: #ffffff;
      line-height: 1.6;
    }
    
    .page {
      padding: 40px 50px;
      max-width: 210mm;
      margin: 0 auto;
    }
    
    .header {
      text-align: center;
      margin-bottom: 35px;
      padding-bottom: 20px;
      border-bottom: 3px solid #128C7E;
    }
    
    .header h1 {
      font-size: 28px;
      font-weight: 700;
      color: #128C7E;
      margin-bottom: 8px;
    }
    
    .header .date {
      font-size: 13px;
      color: #7f8c8d;
    }
    
    .client-info {
      background: #f8f9fa;
      border-left: 4px solid #128C7E;
      padding: 18px 22px;
      margin-bottom: 25px;
    }
    
    .client-name {
      font-size: 18px;
      font-weight: 600;
      color: #2c3e50;
      margin-bottom: 8px;
    }
    
    .client-contact {
      font-size: 13px;
      color: #7f8c8d;
      margin-bottom: 3px;
      color: #95a5a6;
      margin-bottom: 5px;
    }
    
    .date {
      font-size: 13px;
      color: #34495e;
      font-weight: 500;
    }
    
    .project-info {
      background: linear-gradient(135deg, #128C7E 0%, #25D366 100%);
      color: white;
      padding: 22px 28px;
      border-radius: 8px;
      margin-bottom: 30px;
    }
    
    .project-info h2 {
      font-size: 22px;
      font-weight: 600;
      margin-bottom: 5px;
    }
    
    .project-info .meta {
      font-size: 13px;
      opacity: 0.85;
    }
    
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-bottom: 30px;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      overflow: hidden;
    }
    
    thead {
      background: #2c3e50;
      color: white;
    }
    
    thead th {
      padding: 14px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    
    tbody tr {
      background: white;
      transition: background 0.2s;
    }
    
    tbody tr:nth-child(even) {
      background: #f8f9fa;
    }
    
    tbody td {
      padding: 12px;
      font-size: 13px;
      border-bottom: 1px solid #e9ecef;
    }
    
    tbody tr:last-child td {
      border-bottom: none;
    }
    
    .item-number {
      font-weight: 600;
      color: #95a5a6;
    }
    
    .item-name {
      font-weight: 500;
      color: #2c3e50;
    }
    
    .text-right {
      text-align: right;
    }
    
    .total-section {
      text-align: right;
      margin-top: 25px;
    }
    
    .total-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      padding: 8px 0;
      font-size: 15px;
    }
    
    .total-row.grand-total {
      font-size: 26px;
      font-weight: 700;
      color: #128C7E;
      padding-top: 15px;
      margin-top: 10px;
      border-top: 3px solid #128C7E;
    }
    
    .total-label {
      margin-right: 20px;
      font-weight: 600;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e9ecef;
      text-align: center;
      color: #95a5a6;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>PRESUPUESTO</h1>
      <div class="date">${today}</div>
    </div>
    
    <div class="client-info">
      <div class="client-name">${clienteNombre}</div>
      ${clienteTelefono ? `<div class="client-contact">📱 ${clienteTelefono}</div>` : ''}
      ${clienteEmail ? `<div class="client-contact">📧 ${clienteEmail}</div>` : ''}
    </div>
    
    <div class="project-info">
      <h2>${budgetName}</h2>
      <div class="meta">Estimación de Costos</div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th style="width: 8%;">#</th>
          <th style="width: 42%;">Descripción</th>
          <th style="width: 14%;" class="text-right">Cantidad</th>
          <th style="width: 18%;" class="text-right">Precio Unit.</th>
          <th style="width: 18%;" class="text-right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => `
          <tr>
            <td class="item-number">${String(index + 1).padStart(2, '0')}</td>
            <td class="item-name">${item.item}</td>
            <td class="text-right">${item.cantidad.toLocaleString('es-CL')}</td>
            <td class="text-right">$${item.precioUnitario.toLocaleString('es-CL')}</td>
            <td class="text-right">$${item.subtotal.toLocaleString('es-CL')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="total-section">
      <div class="total-row grand-total">
        <span class="total-label">TOTAL</span>
        <span>$${total.toLocaleString('es-CL')}</span>
      </div>
    </div>
    
    <div class="footer">
      Generado via WhatsApp
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

export default new PDFService();
