export type AttachmentFolderEntry = {
  id: string
  name: string
  path: string
  parentId: string | null
  description?: string | null
}

export type AttachmentTagEntry = {
  id: string
  key: string
  name: string
  description?: string | null
}

export type BatchUploadRow = {
  id: string
  file: File
  name: string
  description: string
  tagKeys: string[]
  isPublic: boolean
  status: 'pending' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}
