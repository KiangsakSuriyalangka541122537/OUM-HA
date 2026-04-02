-- Table: oum_ha_fmea_reports
CREATE TABLE IF NOT EXISTS public.oum_ha_fmea_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    document_name TEXT NOT NULL,
    process_name TEXT,
    failure_mode TEXT,
    report_data JSONB NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.oum_ha_fmea_reports ENABLE ROW LEVEL SECURITY;

-- Create Policies for Anonymous Access (For development/preview)
-- Note: In production, you should restrict this to authenticated users if needed.
CREATE POLICY "Allow anonymous inserts" ON public.oum_ha_fmea_reports FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow anonymous selects" ON public.oum_ha_fmea_reports FOR SELECT TO public USING (true);
