/**
 * Types for inventory verification functionality
 */

/**
 * Data received from Sigma workbook for inventory verification
 */
export interface InventoryVerificationData {
  sku: string;
  productName: string;
  systemQty: number;
  // Additional optional fields from Sigma
  fromStore?: string;
  toStore?: string;
  requestedQty?: number;
}

/**
 * Props for InventoryVerificationModal component
 */
export interface InventoryVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  data: InventoryVerificationData | null;
  onConfirm: (physicalCount: number, transferQty: number, notes: string) => void;
}

