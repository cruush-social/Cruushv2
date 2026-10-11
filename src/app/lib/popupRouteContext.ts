import { createContext, useContext } from 'react';

export const PopupRouteContext = createContext<{ onClose: () => void } | null>(null);
export const usePopupRoute = () => useContext(PopupRouteContext);
