import axios from 'axios';

class WhatsAppService {
  constructor(phoneNumberId, accessToken, businessAccountId = null) {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
    this.businessAccountId = businessAccountId;
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';
    
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async enviarMensajeTexto(destinatario, texto) {
    try {
      console.log(`📤 Enviando mensaje de texto a ${destinatario}`);
      
      const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: destinatario,
        type: 'text',
        text: {
          preview_url: false,
          body: texto
        }
      });

      console.log('✅ Mensaje enviado:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error.response?.data || error.message);
      throw this._handleError(error);
    }
  }

  async enviarImagen(destinatario, imageUrl, caption = '') {
    try {
      console.log(`📤 Enviando imagen a ${destinatario}`);
      
      const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: destinatario,
        type: 'image',
        image: {
          link: imageUrl,
          caption: caption
        }
      });

      console.log('✅ Imagen enviada:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error enviando imagen:', error.response?.data || error.message);
      throw this._handleError(error);
    }
  }

  async enviarDocumento(destinatario, documentUrl, filename, caption = '') {
    try {
      console.log(`📤 Enviando documento a ${destinatario}`);
      
      const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: destinatario,
        type: 'document',
        document: {
          link: documentUrl,
          filename: filename,
          caption: caption
        }
      });

      console.log('✅ Documento enviado:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error enviando documento:', error.response?.data || error.message);
      throw this._handleError(error);
    }
  }

  async marcarComoLeido(mensajeId) {
    try {
      console.log(`📖 Marcando mensaje como leído: ${mensajeId}`);
      
      const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: mensajeId
      });

      console.log('✅ Mensaje marcado como leído');
      return response.data;
    } catch (error) {
      console.error('❌ Error marcando como leído:', error.response?.data || error.message);
      return null; 
    }
  }

  async obtenerInfoTelefono() {
    try {
      const response = await this.client.get(`/${this.phoneNumberId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error obteniendo info del teléfono:', error.response?.data || error.message);
      throw this._handleError(error);
    }
  }


  async obtenerPerfilNegocio() {
    try {
      const response = await this.client.get(`/${this.phoneNumberId}/whatsapp_business_profile`, {
        params: {
          fields: 'about,address,description,email,profile_picture_url,websites,vertical'
        }
      });
      return response.data;
    } catch (error) {
      console.error('❌ Error obteniendo perfil de negocio:', error.response?.data || error.message);
      throw this._handleError(error);
    }
  }

  verificarCredenciales() {
    const errores = [];
    
    if (!this.phoneNumberId) errores.push('WHATSAPP_PHONE_NUMBER_ID no configurado');
    if (!this.accessToken) errores.push('WHATSAPP_ACCESS_TOKEN no configurado');
    if (!this.businessAccountId) errores.push('WHATSAPP_BUSINESS_ACCOUNT_ID no configurado');
    
    if (errores.length > 0) {
      console.error('❌ Credenciales de WhatsApp faltantes:', errores);
      return false;
    }
    
    console.log('✅ Credenciales de WhatsApp configuradas correctamente');
    return true;
  }


  _handleError(error) {
    if (error.response) {
      const { status, data } = error.response;
      
      let mensaje = 'Error en WhatsApp API';
      
      if (data.error) {
        mensaje = data.error.message || mensaje;
        
        switch (data.error.code) {
          case 100:
            mensaje = 'Parámetro inválido en la solicitud';
            break;
          case 190:
            mensaje = 'Token de acceso inválido o expirado';
            break;
          case 131031:
            mensaje = 'Número de teléfono no válido';
            break;
          case 131051:
            mensaje = 'Usuario bloqueó el número de negocio';
            break;
        }
      }
      
      return new Error(`${mensaje} (${status})`);
    }
    
    return error;
  }
}
export default WhatsAppService;