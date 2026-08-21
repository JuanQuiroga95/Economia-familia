import { NextRequest, NextResponse } from 'next/server';
import cloudinary from '@/lib/cloudinary';
import { getAccountId } from '@/lib/session';

/** Solo comprobantes: imágenes comunes de cámara o galería. */
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const TAMANIO_MAXIMO = 8 * 1024 * 1024; // 8 MB

export async function POST(request: NextRequest) {
  try {
    // Sin sesión no se sube nada: si no, cualquiera usa nuestro Cloudinary de hosting.
    const accountId = await getAccountId();
    if (!accountId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      );
    }

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      return NextResponse.json(
        { error: 'Solo se pueden subir imágenes (JPG, PNG, WEBP o HEIC)' },
        { status: 400 }
      );
    }

    if (file.size > TAMANIO_MAXIMO) {
      return NextResponse.json(
        { error: 'La imagen es muy pesada: el máximo son 8 MB' },
        { status: 400 }
      );
    }

    // Convertir archivo a buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Subir a Cloudinary, separado por cuenta
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `economia/recibos/${accountId}`,
            resource_type: 'image',
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result as { secure_url: string });
          }
        )
        .end(buffer);
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Error al subir el archivo' },
      { status: 500 }
    );
  }
}
