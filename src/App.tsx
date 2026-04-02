import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Monitor, MonitorOff, StopCircle, Play, MessageSquare, Settings, Info, Sparkles, FileText, Lightbulb, Download, Image as ImageIcon, ChevronRight, ChevronDown, Trash2, X, Upload, FileUp, Database, CheckCircle2 } from 'lucide-react';
import { useGeminiLive } from './lib/gemini-live';
import { cn } from './lib/utils';
import { GoogleGenAI, Type } from "@google/genai";
import { toJpeg } from 'html-to-image';
import { supabase } from './lib/supabase';

const FMEA_EXAMPLES = [
  {
    process: "การจำหน่ายผู้ป่วย (Discharge Planning)",
    failureMode: "ผู้ป่วยได้รับใบนัดผิดวันและไม่ได้รับยาเบาหวานกลับบ้าน"
  },
  {
    process: "การให้ยาทางหลอดเลือดดำ (IV Medication Administration)",
    failureMode: "การตั้งอัตราการไหลของยาผิดพลาดเนื่องจากเครื่องให้ยาขัดข้อง"
  },
  {
    process: "การระบุตัวผู้ป่วย (Patient Identification)",
    failureMode: "เจ้าหน้าที่ไม่ได้ตรวจสอบป้ายข้อมือก่อนทำหัตถการ"
  }
];

interface ReportData {
  title: string;
  subtitle: string;
  executiveSummary: string;
  fmeaAnalysis: Array<{ step: string; failureMode: string; causes: string; effects: string }>;
  riskAssessment: {
    severity: { score: number; justification: string };
    occurrence: { score: number; justification: string };
    detection: { score: number; justification: string };
    rpn: { score: number; justification: string };
  };
  preventiveMeasures: Array<{ measure: string; details: string; evidence: string }>;
  actionPlan: Array<{ projectName: string; objective: string; steps: string; kpi: string; target: string; resources: string; responsible: string; timeline: string }>;
  references: string[];
}

export default function App() {
  const {
    isConnected,
    isConnecting,
    isScreenSharing,
    startLive,
    stopLive,
    toggleScreenShare,
    transcript,
    liveError
  } = useGeminiLive();

  const [processText, setProcessText] = useState('');
  const [failureModeText, setFailureModeText] = useState('');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const handleRandomExample = () => {
    const random = FMEA_EXAMPLES[Math.floor(Math.random() * FMEA_EXAMPLES.length)];
    setProcessText(random.process);
    setFailureModeText(random.failureMode);
  };

  const extractFMEADetails = async (text: string) => {
    setIsExtracting(true);
    try {
      // ตรวจสอบ API Key จากหลายแหล่ง (Vite define หรือ import.meta.env)
      const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "undefined" || apiKey === "") {
        throw new Error("ไม่พบ GEMINI_API_KEY ในระบบ กรุณาตรวจสอบว่าได้ใส่ Key ในเมนู Secrets และตั้งชื่อว่า GEMINI_API_KEY หรือ VITE_GEMINI_API_KEY เรียบร้อยแล้ว");
      }
      
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `จากข้อความต่อไปนี้ กรุณาสรุป "กระบวนการ (Process)" และ "รูปแบบความล้มเหลว (Failure Mode)" ที่สำคัญที่สุดออกมาในรูปแบบ JSON:
        
        ข้อความ: ${text}
        
        รูปแบบ JSON ที่ต้องการ:
        {
          "process": "ชื่อกระบวนการ",
          "failureMode": "รายละเอียดความล้มเหลว"
        }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              process: { type: Type.STRING },
              failureMode: { type: Type.STRING }
            },
            required: ["process", "failureMode"]
          }
        }
      });
      
      const data = JSON.parse(response.text);
      setProcessText(data.process);
      setFailureModeText(data.failureMode);
    } catch (error: any) {
      console.error("Extraction Error:", error);
      alert(`ไม่สามารถแยกข้อมูลจากเอกสารได้: ${error.message || String(error)}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      extractFMEADetails(content);
    };
    reader.readAsText(file);
  };

  const generateReport = async () => {
    if (!processText || !failureModeText) return;
    setIsGenerating(true);
    setReportData(null);
    setErrorMsg('');

    try {
      const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "undefined" || apiKey === "") {
        throw new Error("ไม่พบ GEMINI_API_KEY ในระบบ กรุณาตรวจสอบว่าได้ใส่ Key ในเมนู Secrets และตั้งชื่อว่า GEMINI_API_KEY หรือ VITE_GEMINI_API_KEY เรียบร้อยแล้ว");
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      const reportSchema = {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "ชื่อเรื่องรายงานที่สอดคล้องกับปัญหา" },
          subtitle: { type: Type.STRING, description: "รายงานการวิเคราะห์ความเสี่ยงและแผนป้องกัน (FMEA Report)" },
          executiveSummary: { type: Type.STRING, description: "บทสรุปผู้บริหาร อธิบายภาพรวมของปัญหาและความสำคัญ" },
          fmeaAnalysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.STRING, description: "ขั้นตอน (Steps)" },
                failureMode: { type: Type.STRING, description: "รูปแบบความล้มเหลว (Failure Mode)" },
                causes: { type: Type.STRING, description: "สาเหตุที่แท้จริง (Potential Causes)" },
                effects: { type: Type.STRING, description: "ผลกระทบ (Potential Effects)" }
              },
              required: ["step", "failureMode", "causes", "effects"]
            }
          },
          riskAssessment: {
            type: Type.OBJECT,
            properties: {
              severity: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, justification: { type: Type.STRING } }, required: ["score", "justification"] },
              occurrence: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, justification: { type: Type.STRING } }, required: ["score", "justification"] },
              detection: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, justification: { type: Type.STRING } }, required: ["score", "justification"] },
              rpn: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, justification: { type: Type.STRING } }, required: ["score", "justification"] }
            },
            required: ["severity", "occurrence", "detection", "rpn"]
          },
          preventiveMeasures: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                measure: { type: Type.STRING, description: "มาตรการ (Measure)" },
                details: { type: Type.STRING, description: "รายละเอียด (Details)" },
                evidence: { type: Type.STRING, description: "หลักฐานวิชาการอ้างอิง (Evidence)" }
              },
              required: ["measure", "details", "evidence"]
            }
          },
          actionPlan: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                projectName: { type: Type.STRING, description: "ชื่อเรื่อง/โครงการ" },
                objective: { type: Type.STRING, description: "วัตถุประสงค์" },
                steps: { type: Type.STRING, description: "ขั้นตอนดำเนินการ" },
                kpi: { type: Type.STRING, description: "ตัวชี้วัด (KPI)" },
                target: { type: Type.STRING, description: "ค่าเป้าหมาย" },
                resources: { type: Type.STRING, description: "ทรัพยากร" },
                responsible: { type: Type.STRING, description: "ผู้รับผิดชอบ" },
                timeline: { type: Type.STRING, description: "ระยะเวลา" }
              },
              required: ["projectName", "objective", "steps", "kpi", "target", "resources", "responsible", "timeline"]
            }
          },
          references: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["title", "subtitle", "executiveSummary", "fmeaAnalysis", "riskAssessment", "preventiveMeasures", "actionPlan", "references"]
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `คุณคือผู้เชี่ยวชาญด้าน FMEA (Failure Mode and Effects Analysis) ในโรงพยาบาลระดับสากล
        กรุณาวิเคราะห์ข้อมูลต่อไปนี้และสร้างรายงานที่ครอบคลุมและเป็นมืออาชีพที่สุด:
        
        กระบวนการ (Process): ${processText}
        รูปแบบความล้มเหลว (Failure Mode): ${failureModeText}
        
        กรุณาสร้างรายงานตามโครงสร้าง JSON ที่กำหนด โดยใช้ภาษาไทยที่เป็นทางการ ถูกต้องตามหลักวิชาการแพทย์และคุณภาพโรงพยาบาล (HA/JCI)
        ให้ข้อมูลมีความละเอียด ลึกซึ้ง และสามารถนำไปปฏิบัติได้จริง (Actionable)`,
        config: {
          responseMimeType: "application/json",
          responseSchema: reportSchema as any
        }
      });
      
      const data = JSON.parse(response.text);
      setReportData(data);
    } catch (error: any) {
      console.error("Report Generation Error:", error);
      setErrorMsg(`เกิดข้อผิดพลาดในการสร้างรายงาน: ${error.message || String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToWord = () => {
    if (!reportData) return;
    
    const styles = `
      <style>
        @page Section1 { size:841.9pt 595.3pt; mso-page-orientation:landscape; margin:0.5in 0.5in 0.5in 0.5in; }
        div.Section1 { page:Section1; }
        body { font-family: 'Anuphan', 'Sarabun', 'TH Sarabun New', 'Cordia New', sans-serif; color: #000; line-height: 1.3; }
        h1 { text-align: center; color: #000; font-size: 18pt; margin-bottom: 5px; font-weight: bold; }
        h2 { text-align: center; color: #333; font-size: 14pt; font-weight: normal; margin-top: 0; margin-bottom: 20px; }
        h3 { color: #000; font-size: 14pt; border-bottom: 1px solid #000; padding-bottom: 2px; margin-top: 16px; margin-bottom: 8px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #000; }
        th, td { border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top; font-size: 11pt; }
        th { background-color: #f2f2f2; color: #000; font-weight: bold; text-align: center; }
        p { font-size: 11pt; margin-bottom: 8px; text-indent: 2em; }
        ul, ol { margin-top: 0; padding-left: 24px; font-size: 11pt; }
        li { margin-bottom: 4px; }
        .disclaimer { font-size: 9pt; color: #666; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .bg-gray { background-color: #f2f2f2; }
      </style>
    `;

    const content = `
      <h1>${reportData.title}</h1>
      <h2>${reportData.subtitle}</h2>
      
      <h3>1. บทสรุปผู้บริหาร (Executive Summary)</h3>
      <p>${reportData.executiveSummary}</p>
      
      <h3>2. การวิเคราะห์ความล้มเหลวและผลกระทบ (FMEA Analysis)</h3>
      <table>
        <thead>
          <tr>
            <th>ขั้นตอน (Steps)</th>
            <th>รูปแบบความล้มเหลว (Failure Mode)</th>
            <th>สาเหตุที่แท้จริง (Potential Causes)</th>
            <th>ผลกระทบ (Potential Effects)</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.fmeaAnalysis.map(item => `
            <tr>
              <td>${item.step}</td>
              <td>${item.failureMode}</td>
              <td>${item.causes}</td>
              <td>${item.effects}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h3>3. การประเมินความเสี่ยง (Risk Assessment)</h3>
      <table>
        <thead>
          <tr>
            <th>ตัวชี้วัด (Metric)</th>
            <th>คะแนน (Score)</th>
            <th>เหตุผลประกอบ (Justification)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Severity (S) - ความรุนแรง</td>
            <td class="text-center font-bold">${reportData.riskAssessment.severity.score}</td>
            <td>${reportData.riskAssessment.severity.justification}</td>
          </tr>
          <tr>
            <td>Occurrence (O) - โอกาสเกิด</td>
            <td class="text-center font-bold">${reportData.riskAssessment.occurrence.score}</td>
            <td>${reportData.riskAssessment.occurrence.justification}</td>
          </tr>
          <tr>
            <td>Detection (D) - การตรวจจับ</td>
            <td class="text-center font-bold">${reportData.riskAssessment.detection.score}</td>
            <td>${reportData.riskAssessment.detection.justification}</td>
          </tr>
          <tr class="bg-gray">
            <td class="font-bold">RPN (Risk Priority Number)</td>
            <td class="text-center font-bold">${reportData.riskAssessment.rpn.score}</td>
            <td class="font-bold">${reportData.riskAssessment.rpn.justification}</td>
          </tr>
        </tbody>
      </table>

      <h3>4. มาตรการป้องกัน (Preventive Measures)</h3>
      <table>
        <thead>
          <tr>
            <th>มาตรการ (Measure)</th>
            <th>รายละเอียด (Details)</th>
            <th>หลักฐานวิชาการอ้างอิง (Evidence)</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.preventiveMeasures.map(item => `
            <tr>
              <td>${item.measure}</td>
              <td>${item.details}</td>
              <td>${item.evidence}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h3>5. แผนปฏิบัติการ (Action Plan)</h3>
      <table>
        <thead>
          <tr>
            <th>ชื่อเรื่อง/โครงการ</th>
            <th>วัตถุประสงค์</th>
            <th>ขั้นตอนดำเนินการ</th>
            <th>ตัวชี้วัด (KPI)</th>
            <th>เป้าหมาย</th>
            <th>ทรัพยากร</th>
            <th>ผู้รับผิดชอบ</th>
            <th>ระยะเวลา</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.actionPlan.map(item => `
            <tr>
              <td>${item.projectName}</td>
              <td>${item.objective}</td>
              <td>${item.steps.replace(/\n/g, '<br>')}</td>
              <td>${item.kpi}</td>
              <td class="text-center">${item.target}</td>
              <td>${item.resources}</td>
              <td class="text-center">${item.responsible}</td>
              <td class="text-center">${item.timeline}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h3>6. เอกสารอ้างอิง (References)</h3>
      <ol>
        ${reportData.references.map(ref => `<li>${ref}</li>`).join('')}
      </ol>

      <div class="disclaimer">
        ข้อสงวนสิทธิ์ (Disclaimer): แผนภาพและเนื้อหาในเอกสารนี้ถูกจัดทำขึ้นโดยระบบปัญญาประดิษฐ์ (AI-Assisted) เพื่อใช้เป็นแนวทางตั้งต้นในการวิเคราะห์และพัฒนาคุณภาพงานบริการสาธารณสุข ผู้ใช้งานควรพิจารณากลั่นกรองเนื้อหา ปรับปรุงให้สอดคล้องกับบริบทขององค์กร และอ้างอิงมาตรฐานวิชาชีพที่เกี่ยวข้องก่อนนำไปปฏิบัติจริง
      </div>
    `;

    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>FMEA Report</title>${styles}</head><body><div class="Section1">`;
    const footer = "</div></body></html>";
    const sourceHTML = header + content + footer;
    
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = 'FMEA_Report.doc';
    fileDownload.click();
    document.body.removeChild(fileDownload);
  };

  const exportToJPG = async () => {
    if (!reportRef.current) return;
    try {
      const dataUrl = await toJpeg(reportRef.current, { 
        quality: 1.0, 
        backgroundColor: '#ffffff',
        pixelRatio: 2 // Higher resolution
      });
      const link = document.createElement('a');
      link.download = 'FMEA_Report.jpg';
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error exporting to JPG:', error);
    }
  };

  const saveToSupabase = async () => {
    if (!reportData) return;
    
    if (!supabase) {
      setErrorMsg('กรุณาตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ใน Settings ก่อนใช้งาน');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    setSaveSuccess(false);

    try {
      // ชื่อไฟล์ที่ระบบตั้งให้ นำหน้าด้วย OUM-HA-
      const documentName = `OUM-HA-FMEA-${new Date().getTime()}`;
      
      const { error } = await supabase
        .from('oum_ha_fmea_reports')
        .insert([
          {
            document_name: documentName,
            process_name: processText,
            failure_mode: failureModeText,
            report_data: reportData
          }
        ]);

      if (error) throw error;
      
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error saving to Supabase:", err);
      setErrorMsg(`เกิดข้อผิดพลาดในการบันทึกข้อมูลลงฐานข้อมูล: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 bg-brand-off-white overflow-x-hidden">
      {/* Background Accents */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand-cream/50 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-brand-pale-pink/50 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <header className="w-full max-w-6xl flex flex-col md:flex-row items-center justify-between mb-8 z-10 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-brand-rose-deep rounded-2xl flex items-center justify-center shadow-lg">
            <FileText className="text-white w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-brand-dark-brown">PGH FMEA Navigator</h1>
            <p className="text-sm text-brand-rose-brown font-medium">Turning Risk Analysis into Preventive Action.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".txt,.md,.doc,.docx"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="px-4 py-2 rounded-full text-sm font-bold bg-white border border-brand-rose-muted text-brand-rose-muted hover:bg-brand-cream transition-all flex items-center gap-2"
          >
            {isExtracting ? (
               <div className="w-4 h-4 border-2 border-brand-rose-muted/30 border-t-brand-rose-muted rounded-full animate-spin" />
            ) : (
              <FileUp className="w-4 h-4" />
            )}
            นำเข้าเอกสาร (Import)
          </button>
          <button 
            onClick={() => setShowAssistant(!showAssistant)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all duration-300",
              showAssistant ? "bg-brand-rose-deep text-white" : "bg-brand-cream text-brand-rose-brown"
            )}
          >
            <Sparkles className="w-4 h-4" />
            AI Assistant {isConnected && "(Live)"}
          </button>
        </div>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 z-10">
        {/* Main Analysis Form */}
        <div className={cn(
          "transition-all duration-500 flex flex-col gap-6",
          showAssistant ? "lg:col-span-8" : "lg:col-span-12"
        )}>
          <div className="glass-panel rounded-[2rem] p-8 shadow-2xl border-white/40">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-brand-dark-brown flex items-center gap-2">
                    กระบวนการ (Process)
                  </label>
                  {processText && (
                    <button onClick={() => setProcessText('')} className="text-brand-rose-brown hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <textarea 
                  value={processText}
                  onChange={(e) => setProcessText(e.target.value)}
                  placeholder="เช่น การจำหน่ายผู้ป่วย (Discharge Planning)"
                  className="w-full h-32 p-4 rounded-2xl bg-white/50 border border-brand-pale-pink focus:border-brand-rose-muted focus:ring-2 focus:ring-brand-rose-muted/20 outline-none transition-all resize-none text-sm cursor-text text-brand-dark-brown caret-brand-rose-deep"
                  style={{ cursor: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' style=\'fill:black;stroke:white;stroke-width:1px;\'><text y=\'18\' font-family=\'serif\' font-size=\'20\'>I</text></svg>"), text' }}
                />
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-brand-dark-brown flex items-center gap-2">
                    รูปแบบความล้มเหลว (Failure Mode)
                  </label>
                  {failureModeText && (
                    <button onClick={() => setFailureModeText('')} className="text-brand-rose-brown hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <textarea 
                  value={failureModeText}
                  onChange={(e) => setFailureModeText(e.target.value)}
                  placeholder="เช่น ผู้ป่วยได้รับใบนัดผิดวันและไม่ได้รับยาเบาหวานกลับบ้าน"
                  className="w-full h-32 p-4 rounded-2xl bg-white/50 border border-brand-pale-pink focus:border-brand-rose-muted focus:ring-2 focus:ring-brand-rose-muted/20 outline-none transition-all resize-none text-sm cursor-text text-brand-dark-brown caret-brand-rose-deep"
                  style={{ cursor: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' style=\'fill:black;stroke:white;stroke-width:1px;\'><text y=\'18\' font-family=\'serif\' font-size=\'20\'>I</text></svg>"), text' }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={generateReport}
                  disabled={isGenerating || !processText || !failureModeText}
                  className="bg-[#00875A] hover:bg-[#006644] text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-sm"
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                  สร้างรายงานการวิเคราะห์ (Generate Report)
                </button>
                <button 
                  onClick={handleRandomExample}
                  className="bg-[#F5A623] hover:bg-[#D98E1C] text-white px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg active:scale-95 text-sm"
                >
                  <Lightbulb className="w-5 h-5" />
                  ยกตัวอย่างเหตุการณ์ (Random Example)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={saveToSupabase}
                  disabled={!reportData || isSaving}
                  className="bg-brand-grey-brown hover:bg-brand-dark-brown text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : saveSuccess ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <Database className="w-4 h-4" />
                  )}
                  {saveSuccess ? 'บันทึกสำเร็จ' : 'Save to DB'}
                </button>
                <button 
                  onClick={exportToWord}
                  disabled={!reportData}
                  className="bg-[#2B6DE5] hover:bg-[#1E4EB8] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  <FileText className="w-4 h-4" />
                  Export Word (.doc)
                </button>
                <button 
                  onClick={exportToJPG}
                  disabled={!reportData}
                  className="bg-[#9B4DCA] hover:bg-[#7B3DA1] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  <ImageIcon className="w-4 h-4" />
                  Export JPG
                </button>
              </div>
            </div>
            
            {errorMsg && (
              <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100">
                {errorMsg}
              </div>
            )}
          </div>

          {/* Report Display - Custom UI matching the requested image */}
          <AnimatePresence>
            {reportData && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden relative"
              >
                <div className="absolute top-4 right-4 z-10 flex gap-2">
                  <button 
                    onClick={() => setReportData(null)}
                    className="p-2 bg-white/80 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors shadow-sm backdrop-blur-sm border border-gray-100"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* This is the container that gets exported to JPG */}
                <div ref={reportRef} className="p-8 md:p-12 bg-white text-gray-800 font-sans w-full max-w-[1200px] mx-auto">
                  
                  {/* Header */}
                  <div className="text-center mb-10 border-b-2 border-gray-800 pb-6">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 uppercase tracking-wide">
                      {reportData.title}
                    </h1>
                    <h2 className="text-lg md:text-xl text-gray-600 font-medium">
                      {reportData.subtitle}
                    </h2>
                  </div>

                  {/* 1. Executive Summary */}
                  <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 bg-gray-100 p-2 border-l-4 border-gray-800 mb-4">
                      1. บทสรุปผู้บริหาร (Executive Summary)
                    </h3>
                    <p className="text-[15px] leading-relaxed text-gray-700 indent-8">
                      {reportData.executiveSummary}
                    </p>
                  </div>

                  {/* 2. FMEA Analysis */}
                  <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 bg-gray-100 p-2 border-l-4 border-gray-800 mb-4">
                      2. การวิเคราะห์ความล้มเหลวและผลกระทบ (FMEA Analysis)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300 text-[13px]">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/4">ขั้นตอน (Steps)</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/4">รูปแบบความล้มเหลว (Failure Mode)</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/4">สาเหตุที่แท้จริง (Potential Causes)</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/4">ผลกระทบ (Potential Effects)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.fmeaAnalysis.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                              <td className="border border-gray-300 p-2 align-top">{item.step}</td>
                              <td className="border border-gray-300 p-2 align-top">{item.failureMode}</td>
                              <td className="border border-gray-300 p-2 align-top">{item.causes}</td>
                              <td className="border border-gray-300 p-2 align-top">{item.effects}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 3. Risk Assessment */}
                  <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 bg-gray-100 p-2 border-l-4 border-gray-800 mb-4">
                      3. การประเมินความเสี่ยง (Risk Assessment)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300 text-[13px]">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/4">ตัวชี้วัด (Metric)</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/6">คะแนน (Score 1-10)</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">เหตุผลประกอบ (Justification)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border border-gray-300 p-2 font-medium">Severity (S) - ความรุนแรง</td>
                            <td className="border border-gray-300 p-2 text-center font-bold text-red-600">{reportData.riskAssessment.severity.score}</td>
                            <td className="border border-gray-300 p-2">{reportData.riskAssessment.severity.justification}</td>
                          </tr>
                          <tr>
                            <td className="border border-gray-300 p-2 font-medium">Occurrence (O) - โอกาสเกิด</td>
                            <td className="border border-gray-300 p-2 text-center font-bold text-orange-600">{reportData.riskAssessment.occurrence.score}</td>
                            <td className="border border-gray-300 p-2">{reportData.riskAssessment.occurrence.justification}</td>
                          </tr>
                          <tr>
                            <td className="border border-gray-300 p-2 font-medium">Detection (D) - การตรวจจับ</td>
                            <td className="border border-gray-300 p-2 text-center font-bold text-yellow-600">{reportData.riskAssessment.detection.score}</td>
                            <td className="border border-gray-300 p-2">{reportData.riskAssessment.detection.justification}</td>
                          </tr>
                          <tr className="bg-gray-800 text-white">
                            <td className="border border-gray-800 p-2 font-bold">RPN (Risk Priority Number)</td>
                            <td className="border border-gray-800 p-2 text-center font-bold text-lg">{reportData.riskAssessment.rpn.score}</td>
                            <td className="border border-gray-800 p-2 font-medium">{reportData.riskAssessment.rpn.justification}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 4. Preventive Measures */}
                  <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 bg-gray-100 p-2 border-l-4 border-gray-800 mb-4">
                      4. มาตรการป้องกัน (Preventive Measures)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300 text-[13px]">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/4">มาตรการ (Measure)</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/2">รายละเอียด (Details)</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold w-1/4">หลักฐานวิชาการอ้างอิง (Evidence)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.preventiveMeasures.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                              <td className="border border-gray-300 p-2 align-top font-medium text-green-700">{item.measure}</td>
                              <td className="border border-gray-300 p-2 align-top">{item.details}</td>
                              <td className="border border-gray-300 p-2 align-top text-gray-600 italic">{item.evidence}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 5. Action Plan */}
                  <div className="mb-8">
                    <h3 className="text-lg font-bold text-gray-800 bg-gray-100 p-2 border-l-4 border-gray-800 mb-4">
                      5. แผนปฏิบัติการ (Action Plan)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300 text-[12px]">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">ชื่อเรื่อง/โครงการ</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">วัตถุประสงค์</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">ขั้นตอนดำเนินการ</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">ตัวชี้วัด (KPI)</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">เป้าหมาย</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">ทรัพยากร</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">ผู้รับผิดชอบ</th>
                            <th className="border border-gray-300 p-2 text-center text-gray-800 font-bold">ระยะเวลา</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.actionPlan.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                              <td className="border border-gray-300 p-2 align-top font-medium">{item.projectName}</td>
                              <td className="border border-gray-300 p-2 align-top">{item.objective}</td>
                              <td className="border border-gray-300 p-2 align-top whitespace-pre-line">{item.steps}</td>
                              <td className="border border-gray-300 p-2 align-top">{item.kpi}</td>
                              <td className="border border-gray-300 p-2 align-top text-center">{item.target}</td>
                              <td className="border border-gray-300 p-2 align-top">{item.resources}</td>
                              <td className="border border-gray-300 p-2 align-top text-center">{item.responsible}</td>
                              <td className="border border-gray-300 p-2 align-top text-center">{item.timeline}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 6. References */}
                  <div className="mb-12">
                    <h3 className="text-lg font-bold text-gray-800 bg-gray-100 p-2 border-l-4 border-gray-800 mb-4">
                      6. เอกสารอ้างอิง (References)
                    </h3>
                    <ol className="list-decimal pl-6 space-y-2 text-[14px] text-gray-700">
                      {reportData.references.map((ref, idx) => (
                        <li key={idx} className="pl-2">{ref}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Disclaimer */}
                  <div className="mt-8 pt-6 border-t border-gray-200 text-[11px] text-gray-500 leading-relaxed bg-gray-50 p-4 rounded-lg">
                    ข้อสงวนสิทธิ์ (Disclaimer): แผนภาพและเนื้อหาในเอกสารนี้ถูกจัดทำขึ้นโดยระบบปัญญาประดิษฐ์ (AI-Assisted) เพื่อใช้เป็นแนวทางตั้งต้นในการวิเคราะห์และพัฒนาคุณภาพงานบริการสาธารณสุข ผู้ใช้งานควรพิจารณากลั่นกรองเนื้อหา ปรับปรุงให้สอดคล้องกับบริบทขององค์กร และอ้างอิงมาตรฐานวิชาชีพที่เกี่ยวข้องก่อนนำไปปฏิบัติจริง
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Assistant Side Panel */}
        <AnimatePresence>
          {showAssistant && (
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="lg:col-span-4 flex flex-col gap-6"
            >
              <div className="glass-panel rounded-[2rem] p-6 flex flex-col gap-6 min-h-[600px] relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-brand-rose-deep" />
                    <h3 className="font-bold text-brand-dark-brown">AI Assistant</h3>
                  </div>
                  <div className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-bold",
                    isConnected ? "bg-green-100 text-green-700" : "bg-brand-cream text-brand-rose-brown"
                  )}>
                    {isConnected ? "LIVE" : "OFFLINE"}
                  </div>
                </div>

                {/* Live Controls */}
                <div className="flex flex-col items-center justify-center p-8 bg-brand-off-white/50 rounded-3xl border border-brand-pale-pink/30 relative overflow-hidden">
                  {isConnected && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-32 h-32 rounded-full border-2 border-brand-rose-muted/20 pulse-ring" />
                    </div>
                  )}
                  
                  <motion.div 
                    animate={isConnected ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className={cn(
                      "w-24 h-24 rounded-full flex items-center justify-center shadow-xl relative z-10 transition-all duration-500",
                      isConnected ? "bg-brand-rose-deep" : "bg-brand-cream"
                    )}
                  >
                    <Mic className={cn("w-10 h-10", isConnected ? "text-white" : "text-brand-rose-muted")} />
                  </motion.div>

                  <div className="mt-6 flex flex-col gap-3 w-full relative z-10">
                    {liveError && (
                      <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs border border-red-100 text-center">
                        {liveError}
                      </div>
                    )}
                    {!isConnected ? (
                      <button 
                        onClick={startLive}
                        disabled={isConnecting}
                        className="btn-primary w-full justify-center"
                      >
                        {isConnecting ? "Connecting..." : "Start Live Chat"}
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={toggleScreenShare}
                          className={cn(
                            "btn-secondary w-full justify-center",
                            isScreenSharing && "bg-brand-rose-deep text-white"
                          )}
                        >
                          {isScreenSharing ? "Stop Sharing" : "Share Screen"}
                        </button>
                        <button 
                          onClick={stopLive}
                          className="btn-primary bg-red-500 hover:bg-red-600 w-full justify-center"
                        >
                          End Session
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Transcript */}
                <div className="flex-1 flex flex-col bg-white/30 rounded-3xl overflow-hidden border border-brand-pale-pink/20">
                  <div className="p-3 border-b border-brand-rose-muted/10 text-[10px] font-bold uppercase tracking-widest text-brand-rose-brown">
                    Live Transcript
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                    {transcript.length === 0 ? (
                      <p className="text-center opacity-40 mt-8">No messages yet.</p>
                    ) : (
                      transcript.map((line, i) => (
                        <div key={i} className={cn(
                          "p-2 rounded-xl",
                          line.startsWith('You:') ? "bg-brand-cream/50 ml-2" : "bg-brand-rose-deep/5 mr-2"
                        )}>
                          <span className="font-bold opacity-50 mr-1">{line.startsWith('You:') ? 'You:' : 'AI:'}</span>
                          {line.replace(/^(You:|AI:)\s*/, '')}
                        </div>
                      ))
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="mt-12 text-brand-rose-brown/50 text-[10px] font-medium uppercase tracking-[0.2em] z-10 text-center">
        PGH AI-Assisted FMEA Navigator • Turning Risk Analysis into Preventive Action • 2026
      </footer>
    </div>
  );
}
