export interface StoredUploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}
