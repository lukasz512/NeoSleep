# NeoSleep — Arquitectura de Datos e Inteligencia Artificial
## Documento técnico para NotebookLM | Sección IT — Congreso México 2026
### Audiencia: Cirujanos Dentistas (perfil no técnico, enfoque en confianza y eficiencia)

---

## El principio central: el dentista recibe inteligencia, no datos crudos

El sistema NeoSleep está diseñado bajo un principio claro: **la tecnología absorbe la complejidad para que el dentista solo reciba lo que necesita para actuar**. El dentista no analiza señales fisiológicas, no interpreta gráficas de sueño, no clasifica eventos respiratorios. Todo eso lo hace el sistema antes de que el paciente llegue al consultorio.

---

## Flujo de datos: de la señal biológica a la decisión clínica

```
[PACIENTE EN CASA]
Dispositivo Biologix (hardware portátil)
  → Mide toda la noche:
      PAT · SpO2 · Frecuencia cardiaca · Ronquido · Posición corporal
  → Sincronización automática vía WiFi al finalizar el estudio

        ↓

[PLATAFORMA BIOLOGIX — NUBE]
Motor de Inteligencia Artificial
  → Procesa miles de puntos de datos por segundo
  → Calcula: pIAH · IDO · hipnograma · análisis cardiaco
  → Genera: Informe clínico en PDF (validado bajo guías AAMS)

        ↓

[PLATAFORMA NEOSLEEP — SERVIDOR CENTRAL]
Gestión del workflow clínico
  → Recibe el informe · notifica al neumólogo · registra la opinión médica
  → Determina: ¿candidato a NOA? → sí / no / derivar

        ↓

[APP DEL DENTISTA — NeoSleep]
Vista filtrada y procesada
  → El dentista ve: clasificación (Leve / Moderado / Grave) + opinión del neumólogo
  → El dentista sube: modelo 3D intraoral del paciente

        ↓

[ORTHOAPNEA — FABRICACIÓN]
Transferencia segura de archivos 3D
  → Fabricación personalizada del dispositivo NOA en España
  → Envío internacional al dentista
```

---

## Capa 1: El dispositivo Biologix y la señal PAT

El dispositivo Biologix utiliza tecnología **PAT (Peripheral Arterial Tonometry)** — una técnica no invasiva que mide las variaciones en el tono de la arteria periférica durante el sueño. Esta señal, combinada con el oxímetro de pulso integrado, permite detectar con alta precisión los eventos de obstrucción respiratoria y los microdespertares que el paciente no percibe conscientemente.

En una sola noche, el dispositivo captura millones de puntos de datos fisiológicos. El paciente duerme. El sistema trabaja.

---

## Capa 2: La inteligencia artificial — qué hace y qué no hace

El motor de IA de Biologix procesa la señal cruda y realiza seis operaciones clave:

1. **Detecta y clasifica eventos respiratorios** — apneas obstructivas, apneas centrales, hipopneas
2. **Calcula el pIAH** (Índice de Apnea-Hipopnea) — el indicador clínico principal de severidad
3. **Estima las fases del sueño** (hipnograma) — usando variabilidad de frecuencia cardiaca y señal PAT
4. **Mide la saturación de oxígeno** segundo a segundo — identifica caídas y recuperaciones
5. **Analiza el ritmo cardiaco** — detecta patrones de fibrilación auricular y extrasístoles
6. **Correlaciona variables** — ¿los eventos empeoran en posición supina? ¿Solo durante REM?

**Lo que la IA no hace:** no diagnostica. No prescribe. No reemplaza al médico.
La IA convierte datos crudos en información estructurada. El neumólogo convierte esa información en diagnóstico.

---

## Capa 3: NeoSleep como plataforma de orquestación

NeoSleep actúa como el sistema nervioso central del proceso. Recibe el informe de Biologix, lo enruta al neumólogo de la red, registra la opinión clínica formal, y construye el expediente digital del paciente.

Cuando el neumólogo confirma que el paciente es candidato a NOA, la plataforma NeoSleep notifica al dentista asignado. El dentista abre su app y encuentra al paciente listo, con el diagnóstico validado y la recomendación clara.

**El dentista no espera. No interpreta. Solo actúa.**

---

## Capa 4: La app del dentista — interfaz de decisión, no de análisis

La aplicación del dentista está diseñada para mostrar exactamente lo que el dentista necesita y nada más. Es una **PWA (Progressive Web App)** — funciona desde cualquier navegador, sin instalación, en computadora, tableta o teléfono.

Lo que el dentista ve por paciente:
- Clasificación de severidad: **Leve / Moderado / Grave**
- Índice pIAH (número)
- Opinión del neumólogo (texto corto, accionable)
- Estado del caso: *Pendiente escáner 3D → Modelos recibidos → En fabricación → Enviado → Entregado*

Lo que el dentista hace en la app:
- Sube los archivos del escáner intraoral 3D (formato STL/PLY estándar)
- Consulta el estado del pedido en tiempo real

---

## Capa 5: Integración con OrthoApnea — transferencia 3D

Una vez que el dentista sube los modelos 3D, la plataforma NeoSleep los transfiere directamente a los sistemas de producción de **OrthoApnea** (España). No hay correos, no hay archivos por USB, no hay intermediarios manuales. La cadena digital es continua desde el escáner intraoral hasta la orden de fabricación.

OrthoApnea fabrica el dispositivo NOA personalizado y lo envía. El dentista lo recibe y lo entrega al paciente.

---

## Seguridad y privacidad de los datos

Los datos de salud requieren el más alto nivel de protección. La arquitectura de NeoSleep está diseñada con **privacidad por diseño** desde la capa de infraestructura:

- **Cifrado TLS en toda la cadena:** desde el dispositivo Biologix hasta la app del dentista, toda transmisión está cifrada
- **Separación de capas:** los datos de identidad y los datos clínicos se almacenan en capas lógicamente separadas
- **Control de acceso por rol:** el dentista solo ve sus propios pacientes; ningún dentista de la red puede acceder a datos de otro
- **Consentimiento digital del paciente:** firmado antes del estudio, con alcance explícito
- **Cumplimiento LFPDPPP:** alineado con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (México)

Los datos no se venden, no se comparten con terceros fuera del flujo clínico, y el paciente puede solicitar su eliminación en cualquier momento.

---

*Sección IT — preparada para NotebookLM | Congreso México 2026 | v1.0*
