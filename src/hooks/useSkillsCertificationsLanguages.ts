import { useState, useEffect, useCallback } from "react";
import { offlineDb } from "../lib/offlineDb";
import { deleteLocalRow, upsertLocalRow } from "../lib/offlineStore";
import { supabase } from "../lib/offlineSync";
import { uploadToStorage } from "../lib/storageUpload";
import { useAuth } from "../contexts/AuthContext";

// ===== Skills =====
export interface Skill {
  id: string;
  user_id: string;
  name: string;
  proficiency: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export const useSkills = () => {
  const { user } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadSkills = useCallback(async () => {
    if (!user) {
      setSkills([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const data = (await offlineDb.skills
        .where("user_id")
        .equals(user.id)
        .toArray()) as unknown as Skill[];
      const sorted = data
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      setSkills(sorted);
    } catch (err) {
      console.error("Error loading skills:", err);
    }

    setIsLoading(false);
  }, [user]);

  const addSkill = useCallback(
    async (name: string): Promise<Skill | null> => {
      if (!user || !name.trim()) return null;

      // Check if skill already exists
      if (skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        return null;
      }

      const now = new Date().toISOString();
      const newSkill: Skill = {
        id: `skill-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user_id: user.id,
        name: name.trim(),
        proficiency: "",
        order_index: skills.length,
        created_at: now,
        updated_at: now,
      };

      try {
        await upsertLocalRow("skills", newSkill);
        setSkills([...skills, newSkill]);
      } catch (err) {
        console.error("Error adding skill:", err);
        return null;
      }

      return newSkill;
    },
    [user, skills],
  );

  const updateSkill = useCallback(
    async (id: string, updates: Partial<Skill>) => {
      if (!user) return;

      const updatedSkills = skills.map((s) =>
        s.id === id
          ? { ...s, ...updates, updated_at: new Date().toISOString() }
          : s,
      );

      try {
        await upsertLocalRow("skills", {
          ...updatedSkills.find((s) => s.id === id),
        });
        setSkills(updatedSkills);
      } catch (err) {
        console.error("Error updating skill:", err);
      }
    },
    [user, skills],
  );

  const deleteSkill = useCallback(
    async (id: string) => {
      if (!user) return;

      try {
        await deleteLocalRow("skills", id);
        setSkills(skills.filter((s) => s.id !== id));
      } catch (err) {
        console.error("Error deleting skill:", err);
      }
    },
    [user, skills],
  );

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  return {
    skills,
    isLoading,
    addSkill,
    updateSkill,
    deleteSkill,
    reloadSkills: loadSkills,
  };
};

// ===== Certifications =====
export interface Certification {
  id: string;
  user_id: string;
  name: string;
  issuing_organization: string;
  issue_year: number | null;
  issue_month: number | null;
  expiry_year: number | null;
  expiry_month: number | null;
  has_no_expiry: boolean;
  credential_id: string;
  credential_url: string;
  photo_storage_path: string;
  ocr_extracted?: Record<string, unknown>;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export const useCertifications = () => {
  const { user } = useAuth();
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadCertifications = useCallback(async () => {
    if (!user) {
      setCertifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const data = (await offlineDb.certifications
        .where("user_id")
        .equals(user.id)
        .toArray()) as unknown as Certification[];
      const sorted = data
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      setCertifications(sorted);
    } catch (err) {
      console.error("Error loading certifications:", err);
    }

    setIsLoading(false);
  }, [user]);

  const addCertification =
    useCallback(async (): Promise<Certification | null> => {
      if (!user) return null;

      const now = new Date().toISOString();
      const newCert: Certification = {
        id: `cert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user_id: user.id,
        name: "",
        issuing_organization: "",
        issue_year: null,
        issue_month: null,
        expiry_year: null,
        expiry_month: null,
        has_no_expiry: false,
        credential_id: "",
        credential_url: "",
        photo_storage_path: "",
        order_index: certifications.length,
        created_at: now,
        updated_at: now,
      };

      try {
        await upsertLocalRow("certifications", newCert);
        setCertifications([...certifications, newCert]);
      } catch (err) {
        console.error("Error adding certification:", err);
        return null;
      }

      return newCert;
    }, [user, certifications]);

  const updateCertification = useCallback(
    async (id: string, updates: Partial<Certification>) => {
      if (!user) return;

      const updatedCerts = certifications.map((c) =>
        c.id === id
          ? { ...c, ...updates, updated_at: new Date().toISOString() }
          : c,
      );

      const updatedCert = updatedCerts.find((c) => c.id === id);
      if (!updatedCert) return;

      try {
        await upsertLocalRow("certifications", updatedCert);
        setCertifications(updatedCerts);
      } catch (err) {
        console.error("Error updating certification:", err);
      }
    },
    [user, certifications],
  );

  const deleteCertification = useCallback(
    async (id: string) => {
      if (!user) return;

      try {
        await deleteLocalRow("certifications", id);
        setCertifications(certifications.filter((c) => c.id !== id));
      } catch (err) {
        console.error("Error deleting certification:", err);
      }
    },
    [user, certifications],
  );

  const uploadPhoto = useCallback(
    async (id: string, file: File) => {
      if (!user) return;
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/certifications/${id}.${ext}`;
      const buffer = await file.arrayBuffer();
      await uploadToStorage("money-files", path, buffer, file.type, {
        tableName: "certifications",
        recordId: id,
        fieldName: "photo_storage_path",
      });
      updateCertification(id, { photo_storage_path: path });
    },
    [user, updateCertification],
  );

  const getPhotoSignedUrl = useCallback(
    async (storagePath: string): Promise<string | null> => {
      if (!supabase) return null;
      const { data, error } = await supabase.storage
        .from("money-files")
        .createSignedUrl(storagePath, 3600);
      if (error) {
        console.error("Error creating signed URL:", error);
        return null;
      }
      return data.signedUrl;
    },
    [],
  );

  const runOcr = useCallback(
    async (id: string, file: File): Promise<Record<string, unknown> | null> => {
      if (!supabase) return null;
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++)
          binary += String.fromCharCode(bytes[i]);
        const base64Data = btoa(binary);

        const { data, error } = await supabase.functions.invoke(
          "ocr_document",
          { body: { base64Data, mimeType: file.type, type: "certification" } },
        );
        if (error) throw error;
        if (data?.result) {
          const ocrResult = data.result as Record<string, unknown>;
          updateCertification(id, { ocr_extracted: ocrResult });
          return ocrResult;
        }
        return null;
      } catch (err) {
        console.error("Certification OCR failed:", err);
        return null;
      }
    },
    [updateCertification],
  );

  useEffect(() => {
    loadCertifications();
  }, [loadCertifications]);

  return {
    certifications,
    isLoading,
    addCertification,
    updateCertification,
    deleteCertification,
    uploadPhoto,
    getPhotoSignedUrl,
    runOcr,
    reloadCertifications: loadCertifications,
  };
};

// ===== Languages =====
export interface Language {
  id: string;
  user_id: string;
  name: string;
  proficiency: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export const useLanguages = () => {
  const { user } = useAuth();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLanguages = useCallback(async () => {
    if (!user) {
      setLanguages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const data = (await offlineDb.languages
        .where("user_id")
        .equals(user.id)
        .toArray()) as unknown as Language[];
      const sorted = data
        .slice()
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
      setLanguages(sorted);
    } catch (err) {
      console.error("Error loading languages:", err);
    }

    setIsLoading(false);
  }, [user]);

  const addLanguage = useCallback(async (): Promise<Language | null> => {
    if (!user) return null;

    const now = new Date().toISOString();
    const newLang: Language = {
      id: `lang-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      user_id: user.id,
      name: "",
      proficiency: "",
      order_index: languages.length,
      created_at: now,
      updated_at: now,
    };

    try {
      await upsertLocalRow("languages", newLang);
      setLanguages([...languages, newLang]);
    } catch (err) {
      console.error("Error adding language:", err);
      return null;
    }

    return newLang;
  }, [user, languages]);

  const updateLanguage = useCallback(
    async (id: string, updates: Partial<Language>) => {
      if (!user) return;

      const updatedLangs = languages.map((l) =>
        l.id === id
          ? { ...l, ...updates, updated_at: new Date().toISOString() }
          : l,
      );

      const updatedLang = updatedLangs.find((l) => l.id === id);
      if (!updatedLang) return;

      try {
        await upsertLocalRow("languages", updatedLang);
        setLanguages(updatedLangs);
      } catch (err) {
        console.error("Error updating language:", err);
      }
    },
    [user, languages],
  );

  const deleteLanguage = useCallback(
    async (id: string) => {
      if (!user) return;

      try {
        await deleteLocalRow("languages", id);
        setLanguages(languages.filter((l) => l.id !== id));
      } catch (err) {
        console.error("Error deleting language:", err);
      }
    },
    [user, languages],
  );

  useEffect(() => {
    loadLanguages();
  }, [loadLanguages]);

  return {
    languages,
    isLoading,
    addLanguage,
    updateLanguage,
    deleteLanguage,
    reloadLanguages: loadLanguages,
  };
};

// ===== Options =====
export const proficiencyOptions = [
  { value: "", label: "Select" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

export const languageProficiencyOptions = [
  { value: "", label: "Select" },
  { value: "elementary", label: "Elementary" },
  { value: "limited", label: "Conversational" },
  { value: "professional", label: "Professional" },
  { value: "full-professional", label: "Fluent" },
  { value: "native", label: "Native / Bilingual" },
];
