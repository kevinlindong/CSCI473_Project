export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'quote'
  | 'latex'
  | 'code'
  | 'chemistry'
  | 'callout'
  | 'divider'
  | 'table'
  | 'diagram'
  | 'bullet_list'
  | 'ordered_list'

export type Block = {
  id: string
  type: BlockType
  content: string
  meta?: Record<string, unknown>
}

export function newBlock(type: BlockType): Block {
  return {
    id: crypto.randomUUID(),
    type,
    content: '',
    meta: type === 'code' ? { language: 'python', filename: '' }
      : type === 'callout' ? { calloutType: 'info' }
      : type === 'chemistry' ? { caption: '' }
      : type === 'table' ? { caption: '' }
      : type === 'diagram' ? { caption: '' }
      : undefined,
  }
}
