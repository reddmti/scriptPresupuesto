export interface ExtractedIntent {
  intent: 'crear_presupuesto' | 'agregar_item' | 'editar_item' | 'eliminar_item' | 
          'eliminar_presupuesto' | 'confirmar_eliminacion' | 'listar_presupuestos' | 
          'cambiar_presupuesto' | 'descargar_presupuesto' | 'ver_items' | 'ver_total' |
          'consulta_general' | 'saludo' | 'desconocido';
  entities: {
    nombrePresupuesto?: string;
    item?: string | string[]; // Puede ser array para múltiples items
    cantidad?: number | number[];
    precioUnitario?: number | number[];
    accion?: 'agregar' | 'editar' | 'eliminar';
    numeroSeleccion?: number;
  };
  confidence: number;
  needsContext: boolean;
}

export interface BudgetItem {
  item: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  notas?: string;
}

export interface UserContext {
  phone: string;
  activeSheetId: string | null;
  googleSheetUrl: string | null;
  recentMessages: Array<{ role: string; content: string }>;
}
