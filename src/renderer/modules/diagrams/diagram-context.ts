import { createContext } from 'react'

/** Azioni che le forme possono chiedere all'editor del diagramma. */
export const DiagramContext = createContext<{ setText: (id: string, text: string) => void }>({ setText: () => undefined })
