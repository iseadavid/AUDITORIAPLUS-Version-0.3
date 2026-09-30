import { create } from 'zustand';  
import { FloorDiscrepancy, VirtualTransfer } from '../types/audit';  
  
interface DiscrepancyState {  
  pendingFloorDiscrepancies: FloorDiscrepancy[];  
  virtualTransfers: VirtualTransfer[];  
  isLoading: boolean;  
  setPendingDiscrepancies: (discrepancies: FloorDiscrepancy[]) => void;  
  resolveDiscrepancyLocally: (discrepancyId: string, floorQty: number, transfer?: VirtualTransfer) => void;  
}  
  
export const useDiscrepancyStore = create<DiscrepancyState>((set) => ({  
  pendingFloorDiscrepancies: [],  
  virtualTransfers: [],  
  isLoading: false,  
  
  setPendingDiscrepancies: (discrepancies) => set({ pendingFloorDiscrepancies: discrepancies }),  
  
  resolveDiscrepancyLocally: (discrepancyId, floorQty, transfer) => {  
    set((state) => ({  
      pendingFloorDiscrepancies: state.pendingFloorDiscrepancies.filter(d => (d as any).discrepancyId !== discrepancyId && (d as any).DiscrepancyId !== discrepancyId),  
      virtualTransfers: transfer ? [...state.virtualTransfers, transfer] : state.virtualTransfers  
    }));  
  }  
}));
