import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  User,
  Building2,
  Briefcase,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  MapPin,
  Calendar,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  BookOpen,
  Award,
  Globe,
  Users,
  Lock,
  Sparkles,
  Instagram,
  Linkedin,
  Github,
  Youtube,
  MessageCircle,
  MessageSquare,
  Twitter,
  X,
  RefreshCw,
  Save,
  Link2,
  Star,
  Copy,
  Check,
  HeartPulse,
  ScanLine,
  Camera,
} from "lucide-react";
import { Layout, AlertDialog, EmailInput, UrlInput } from "../components";
import { useAuth } from "../contexts/AuthContext";
import { useUndoRedo } from "../contexts/UndoRedoContext";
import {
  useProfile,
  Profile,
  SocialLink,
  HealthInfo,
} from "../hooks/useProfile";
import {
  useWorkExperiences,
  WorkExperience,
  employmentTypeOptions,
  monthOptions,
  getYearOptions,
} from "../hooks/useWorkExperiences";
import {
  useEducations,
  Education,
  degreeOptions,
} from "../hooks/useEducations";
import {
  useSkills,
  useCertifications,
  useLanguages,
  Certification,
  Language,
  languageProficiencyOptions,
} from "../hooks/useSkillsCertificationsLanguages";
import { useAffiliations, Affiliation } from "../hooks/useAffiliations";
import { useBufferedList } from "../hooks/useBufferedList";
import { syncProfileTables } from "../lib/offlineSync";

const PhotoThumbnail = ({
  certId,
  localUrl,
  storagePath,
  getSignedUrl,
}: {
  certId: string;
  localUrl?: string;
  storagePath?: string;
  getSignedUrl: (path: string) => Promise<string | null>;
}) => {
  const [url, setUrl] = useState<string | null>(localUrl ?? null);

  useEffect(() => {
    if (localUrl) {
      setUrl(localUrl);
      return;
    }
    if (storagePath) {
      getSignedUrl(storagePath).then((u) => {
        if (u) setUrl(u);
      });
    }
  }, [localUrl, storagePath, getSignedUrl]);

  if (!url) return null;
  return (
    <img
      key={certId}
      src={url}
      alt="Certificate"
      className="h-20 w-auto rounded-lg border border-slate-200 object-cover"
    />
  );
};

export const ProfilePage = () => {
  const { user } = useAuth();
  const {
    profile,
    isLoading: isProfileLoading,
    saveProfile,
    restoreState,
    reloadProfile,
  } = useProfile();
  const { registerPage, unregisterPage, setCurrentPage, saveState } =
    useUndoRedo();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Set current page and register with undo/redo system
  useEffect(() => {
    if (profile) {
      setCurrentPage("profile");

      const getCurrentState = () => profile;
      const handleRestore = async (state: unknown) => {
        const s = state as Profile;
        if (restoreState) {
          await restoreState(s);
        }
      };

      registerPage("profile", getCurrentState, handleRestore);
      return () => unregisterPage("profile");
    }
  }, [profile, registerPage, unregisterPage, restoreState, setCurrentPage]);

  // Save state to history
  const saveToHistory = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveState("profile");
    }, 500);
  }, [saveState]);

  // Hooks for data
  const {
    experiences,
    isLoading: isExpLoading,
    addExperience,
    updateExperience,
    deleteExperience,
    reloadExperiences,
  } = useWorkExperiences();

  const {
    educations,
    isLoading: isEduLoading,
    addEducation,
    updateEducation,
    deleteEducation,
    reloadEducations,
  } = useEducations();

  const {
    skills,
    isLoading: isSkillsLoading,
    addSkill,
    deleteSkill,
    reloadSkills,
  } = useSkills();

  const {
    certifications,
    isLoading: isCertsLoading,
    addCertification,
    updateCertification,
    deleteCertification,
    uploadPhoto,
    getPhotoSignedUrl,
    runOcr,
    reloadCertifications,
  } = useCertifications();

  const {
    languages,
    isLoading: isLangsLoading,
    addLanguage,
    updateLanguage,
    deleteLanguage,
    reloadLanguages,
  } = useLanguages();

  const {
    affiliations,
    isLoading: isAffsLoading,
    addAffiliation,
    updateAffiliation,
    deleteAffiliation,
    isProtectedAffiliation,
    reloadAffiliations,
  } = useAffiliations();

  // Local state for Basic Info
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [headMessage, setHeadMessage] = useState("");
  const [healthInfo, setHealthInfo] = useState<HealthInfo>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = useCallback((value: string, field: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  }, []);
  const lastProfileSyncRef = useRef<{ id: string; updated_at: string } | null>(
    null,
  );

  // Buffered Lists (Local State for Inputs)
  const {
    localItems: localExperiences,
    updateLocal: updateLocalExperience,
    saveAll: saveExperiences,
    isDirty: isExpDirty,
  } = useBufferedList({
    items: experiences,
    updateRemote: updateExperience,
  });

  const {
    localItems: localEducations,
    updateLocal: updateLocalEducation,
    saveAll: saveEducations,
    isDirty: isEduDirty,
  } = useBufferedList({
    items: educations,
    updateRemote: updateEducation,
  });

  const {
    localItems: localCertifications,
    updateLocal: updateLocalCertification,
    saveAll: saveCertifications,
    isDirty: isCertDirty,
  } = useBufferedList({
    items: certifications,
    updateRemote: updateCertification,
  });

  const {
    localItems: localLanguages,
    updateLocal: updateLocalLanguage,
    saveAll: saveLanguages,
    isDirty: isLangDirty,
  } = useBufferedList({
    items: languages,
    updateRemote: updateLanguage,
  });

  const {
    localItems: localAffiliations,
    updateLocal: updateLocalAffiliation,
    saveAll: saveAffiliations,
    isDirty: isAffDirty,
  } = useBufferedList({
    items: affiliations,
    updateRemote: updateAffiliation,
  });

  // UI State
  const [expandedExpId, setExpandedExpId] = useState<string | null>(null);
  const [expandedEduId, setExpandedEduId] = useState<string | null>(null);
  const [expandedCertId, setExpandedCertId] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<{
    certId: string;
    data: Record<string, unknown>;
  } | null>(null);
  const [isOcrRunning, setIsOcrRunning] = useState<string | null>(null);
  const [certPhotoUrls, setCertPhotoUrls] = useState<Record<string, string>>(
    {},
  );
  const certFileRef = useRef<File | null>(null);
  const certFileInputRef = useRef<HTMLInputElement | null>(null);
  const [expandedLangId, setExpandedLangId] = useState<string | null>(null);
  const [expandedAffId, setExpandedAffId] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState<Record<string, string>>({});
  const [newSkillInput, setNewSkillInput] = useState("");
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Social Links State
  const [isSocialModalOpen, setIsSocialModalOpen] = useState(false);
  const [socialLinkInput, setSocialLinkInput] = useState<Partial<SocialLink>>({
    platform: "website",
    url: "",
  });
  const [editingSocialLinkId, setEditingSocialLinkId] = useState<string | null>(
    null,
  );
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingProfileDelete, setPendingProfileDelete] = useState<{
    type:
      | "work_experience"
      | "education"
      | "certification"
      | "language"
      | "affiliation";
    id: string;
  } | null>(null);
  const [pendingSkillDelete, setPendingSkillDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Dirty check for Basic Info
  const isHealthDirty =
    profile &&
    JSON.stringify(healthInfo) !== JSON.stringify(profile.health_info ?? {});

  const isBasicInfoDirty =
    profile &&
    (displayName !== (profile.display_name || "") ||
      bio !== (profile.bio || "") ||
      firstMessage !== (profile.first_message || "") ||
      headMessage !== (profile.head_message || "") ||
      isHealthDirty);

  const isAnyDirty =
    isBasicInfoDirty ||
    isExpDirty ||
    isEduDirty ||
    isCertDirty ||
    isLangDirty ||
    isAffDirty;

  const yearOptions = getYearOptions();

  // Sync Basic Info with profile data
  useEffect(() => {
    if (!profile) {
      lastProfileSyncRef.current = null;
      setDisplayName("");
      setBio("");
      setFirstMessage("");
      setHeadMessage("");
      return;
    }

    const lastSync = lastProfileSyncRef.current;
    const isNewProfile = !lastSync || lastSync.id !== profile.id;
    const isNewUpdate = !lastSync || lastSync.updated_at !== profile.updated_at;

    if (isNewProfile || (!isBasicInfoDirty && isNewUpdate)) {
      setDisplayName(profile.display_name || "");
      setBio(profile.bio || "");
      setFirstMessage(profile.first_message || "");
      setHeadMessage(profile.head_message || "");
      setHealthInfo(profile.health_info ?? {});
    }

    lastProfileSyncRef.current = {
      id: profile.id,
      updated_at: profile.updated_at,
    };
  }, [profile, isBasicInfoDirty]);

  const handleSaveAll = async () => {
    setIsSavingAll(true);
    try {
      // Save Basic Info
      if (isBasicInfoDirty) {
        await saveProfile({
          display_name: displayName,
          bio,
          first_message: firstMessage,
          head_message: headMessage,
          health_info: healthInfo,
        });
      }

      // Save Lists
      await Promise.all([
        saveExperiences(),
        saveEducations(),
        saveCertifications(),
        saveLanguages(),
        saveAffiliations(),
      ]);

      saveToHistory();
    } catch (error) {
      console.error("Failed to save all changes:", error);
      setSaveError("Failed to save changes. Please try again.");
    } finally {
      setIsSavingAll(false);
    }
  };

  // Helper for social icons
  const getSocialIcon = (platform: string) => {
    switch (platform) {
      case "x":
        return <Twitter size={16} />; // Using Twitter icon for X
      case "instagram":
        return <Instagram size={16} />;
      case "linkedin":
        return <Linkedin size={16} />;
      case "github":
        return <Github size={16} />;
      case "youtube":
        return <Youtube size={16} />;
      case "tiktok":
        return <MessageCircle size={16} />;
      default:
        return <Globe size={16} />;
    }
  };

  const getSocialLabel = (platform: string) => {
    switch (platform) {
      case "x":
        return "X (Twitter)";
      case "instagram":
        return "Instagram";
      case "linkedin":
        return "LinkedIn";
      case "github":
        return "GitHub";
      case "youtube":
        return "YouTube";
      case "tiktok":
        return "TikTok";
      default:
        return "Website/Other";
    }
  };

  const handleSaveSocialLink = async () => {
    if (!socialLinkInput.url) return;

    const currentLinks = profile?.social_links || [];

    if (editingSocialLinkId) {
      // Edit existing link
      const updatedLinks = currentLinks.map((link) =>
        link.id === editingSocialLinkId
          ? {
              ...link,
              platform:
                (socialLinkInput.platform as SocialLink["platform"]) ||
                "website",
              url: socialLinkInput.url || "",
              username: socialLinkInput.username,
            }
          : link,
      );
      await saveProfile({ social_links: updatedLinks });
    } else {
      // Add new link
      const newLink: SocialLink = {
        id: Math.random().toString(36).substr(2, 9),
        platform:
          (socialLinkInput.platform as SocialLink["platform"]) || "website",
        url: socialLinkInput.url,
        username: socialLinkInput.username,
      };
      await saveProfile({ social_links: [...currentLinks, newLink] });
    }

    setSocialLinkInput({ platform: "website", url: "", username: "" });
    setEditingSocialLinkId(null);
    setIsSocialModalOpen(false);
    saveToHistory();
  };

  const handleEditSocialLink = (link: SocialLink) => {
    setEditingSocialLinkId(link.id);
    setSocialLinkInput({
      platform: link.platform,
      url: link.url,
      username: link.username,
    });
    setIsSocialModalOpen(true);
  };

  const handleOpenAddSocialLink = () => {
    setEditingSocialLinkId(null);
    setSocialLinkInput({ platform: "website", url: "", username: "" });
    setIsSocialModalOpen(true);
  };

  const handleConfirmRemoveSocialLink = async () => {
    if (!pendingDeleteId) return;
    const currentLinks = profile?.social_links || [];
    const deleteId = pendingDeleteId;
    setPendingDeleteId(null);
    await saveProfile({
      social_links: currentLinks.filter((l) => l.id !== deleteId),
    });
    saveToHistory();
  };

  const handleConfirmProfileDelete = async () => {
    if (!pendingProfileDelete) return;
    const { type, id } = pendingProfileDelete;
    setPendingProfileDelete(null);
    switch (type) {
      case "work_experience":
        await deleteExperience(id);
        break;
      case "education":
        await deleteEducation(id);
        break;
      case "certification":
        await deleteCertification(id);
        break;
      case "language":
        await deleteLanguage(id);
        break;
      case "affiliation":
        await deleteAffiliation(id);
        break;
      default:
        break;
    }
  };

  const deleteTargetLabel = pendingProfileDelete
    ? {
        work_experience: "work experience",
        education: "education",
        certification: "certification",
        language: "language",
        affiliation: "affiliation",
      }[pendingProfileDelete.type]
    : "";

  const handleAddExperience = async () => {
    const newExp = await addExperience();
    if (newExp) {
      setExpandedExpId(newExp.id);
    }
  };

  const handleUpdateExperience = (
    id: string,
    field: keyof WorkExperience,
    value: unknown,
  ) => {
    updateLocalExperience(id, field, value);
  };

  const handleAddSkill = (expId: string) => {
    const skill = skillInput[expId]?.trim();
    if (!skill) return;

    const exp = localExperiences.find((e) => e.id === expId);
    if (exp) {
      const newSkills = [...(exp.skills || []), skill];
      updateLocalExperience(expId, "skills", newSkills);
      setSkillInput({ ...skillInput, [expId]: "" });
    }
  };

  const handleRemoveSkill = (expId: string, skillIndex: number) => {
    const exp = localExperiences.find((e) => e.id === expId);
    if (exp) {
      const newSkills = exp.skills.filter((_, i) => i !== skillIndex);
      updateLocalExperience(expId, "skills", newSkills);
    }
  };

  // Education handlers
  const handleAddEducation = async () => {
    const newEdu = await addEducation();
    if (newEdu) {
      setExpandedEduId(newEdu.id);
    }
  };

  const handleUpdateEducation = (
    id: string,
    field: keyof Education,
    value: unknown,
  ) => {
    updateLocalEducation(id, field, value);
  };

  // Skill handlers (Global Skills) - These are direct for now as they are simple tags
  const handleAddNewSkill = async () => {
    if (newSkillInput.trim()) {
      await addSkill(newSkillInput.trim());
      setNewSkillInput("");
    }
  };

  // Certification handlers
  const handleAddCertification = async () => {
    const newCert = await addCertification();
    if (newCert) {
      setExpandedCertId(newCert.id);
    }
  };

  const handleUpdateCertification = (
    id: string,
    field: keyof Certification,
    value: unknown,
  ) => {
    updateLocalCertification(id, field, value);
  };

  // Language handlers
  const handleAddLanguage = async () => {
    const newLang = await addLanguage();
    if (newLang) {
      setExpandedLangId(newLang.id);
    }
  };

  const handleUpdateLanguage = (
    id: string,
    field: keyof Language,
    value: unknown,
  ) => {
    updateLocalLanguage(id, field, value);
  };

  // Affiliation handlers
  const handleAddAffiliation = async () => {
    const newAff = await addAffiliation();
    if (newAff) {
      setExpandedAffId(newAff.id);
    }
  };

  const handleUpdateAffiliation = (
    id: string,
    field: keyof Affiliation,
    value: unknown,
  ) => {
    updateLocalAffiliation(id, field, value);
  };

  const isLoading =
    isProfileLoading ||
    isExpLoading ||
    isEduLoading ||
    isSkillsLoading ||
    isCertsLoading ||
    isLangsLoading ||
    isAffsLoading;

  const syncProfileData = useCallback(async () => {
    await syncProfileTables();
    await Promise.all([
      reloadProfile(),
      reloadExperiences(),
      reloadEducations(),
      reloadSkills(),
      reloadCertifications(),
      reloadLanguages(),
      reloadAffiliations(),
    ]);
  }, [
    reloadProfile,
    reloadExperiences,
    reloadEducations,
    reloadSkills,
    reloadCertifications,
    reloadLanguages,
    reloadAffiliations,
  ]);

  useEffect(() => {
    if (!user) return;
    syncProfileData();
  }, [user, syncProfileData]);

  const handleRefresh = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncProfileData();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, syncProfileData]);

  // Collect all skills from work experiences
  const workExperienceSkills = localExperiences.flatMap(
    (exp) => exp.skills || [],
  );
  const allSkills = [
    ...new Set([...skills.map((s) => s.name), ...workExperienceSkills]),
  ];

  const headerActions = (
    <button
      onClick={handleSaveAll}
      disabled={!isAnyDirty || isSavingAll}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all shadow-sm ${
        isAnyDirty
          ? "bg-sky-500 text-white hover:bg-sky-600 active:scale-95"
          : "bg-slate-200 text-slate-400 cursor-not-allowed"
      }`}
    >
      {isSavingAll ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <Save size={18} />
      )}
      Save
    </button>
  );

  const headerLeft = (
    <button
      onClick={handleRefresh}
      disabled={isSyncing}
      className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
      title="Refresh"
    >
      <RefreshCw
        size={16}
        className={`md:w-[18px] md:h-[18px] ${isSyncing ? "animate-spin" : ""}`}
      />
    </button>
  );

  return (
    <Layout
      pageTitle="Profile"
      headerLeft={headerLeft}
      headerCenter={headerActions}
    >
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 size={32} className="animate-spin neu-text-secondary" />
        </div>
      ) : (
        <div className="h-full overflow-y-auto mobile-scroll-pad">
          {/* Main Content */}
          <main className="max-w-4xl mx-auto px-4 py-4 md:py-8 space-y-4 md:space-y-6">
            {/* Basic Profile Section */}
            <div className="space-y-4 md:space-y-6">
              {/* Email (Read-only) */}
              <div className="neu-card rounded-xl p-4 md:p-6">
                <EmailInput
                  label="Email"
                  value={user?.email || ""}
                  onChange={() => {}}
                  disabled
                  showValidation={false}
                />
                <p className="mt-2 text-xs neu-text-muted">
                  Email cannot be changed
                </p>
              </div>

              {/* Profile Info */}
              <div className="neu-card rounded-xl p-4 md:p-6 space-y-5">
                <h2 className="text-sm font-semibold neu-text-primary mb-4 flex items-center gap-2">
                  <User size={16} className="neu-text-secondary" />
                  Basic Info
                </h2>

                {/* Display Name */}
                <div>
                  <label className="flex items-center justify-between text-sm font-medium neu-text-primary mb-2">
                    Display Name
                    <button
                      type="button"
                      onClick={() => handleCopy(displayName, "displayName")}
                      className="p-1 rounded neu-text-muted hover:neu-text-primary transition-colors"
                      title="Copy"
                    >
                      {copiedField === "displayName" ? (
                        <Check size={14} className="text-emerald-500" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 rounded-lg neu-input"
                  />
                </div>

                {/* Bio */}
                <div>
                  <label className="flex items-center justify-between text-sm font-medium neu-text-primary mb-2">
                    Bio
                    <button
                      type="button"
                      onClick={() => handleCopy(bio, "bio")}
                      className="p-1 rounded neu-text-muted hover:neu-text-primary transition-colors"
                      title="Copy"
                    >
                      {copiedField === "bio" ? (
                        <Check size={14} className="text-emerald-500" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg neu-input resize-none"
                  />
                </div>

                {/* First Message */}
                <div>
                  <label className="flex items-center justify-between text-sm font-medium neu-text-primary mb-2">
                    <span className="flex items-center gap-2">
                      <MessageSquare size={16} className="neu-text-secondary" />
                      First Message
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(firstMessage, "firstMessage")}
                      className="p-1 rounded neu-text-muted hover:neu-text-primary transition-colors"
                      title="Copy"
                    >
                      {copiedField === "firstMessage" ? (
                        <Check size={14} className="text-emerald-500" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </label>
                  <textarea
                    value={firstMessage}
                    onChange={(e) => setFirstMessage(e.target.value)}
                    placeholder="Nice to meet you! I'm looking forward to connecting with you."
                    rows={3}
                    className="w-full px-4 py-3 rounded-lg neu-input resize-none"
                  />
                </div>

                {/* Head Message */}
                <div>
                  <label className="flex items-center justify-between text-sm font-medium neu-text-primary mb-2">
                    <span className="flex items-center gap-2">
                      <MessageSquare size={16} className="neu-text-secondary" />
                      Head Message
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(headMessage, "headMessage")}
                      className="p-1 rounded neu-text-muted hover:neu-text-primary transition-colors"
                      title="Copy"
                    >
                      {copiedField === "headMessage" ? (
                        <Check size={14} className="text-emerald-500" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </label>
                  <textarea
                    value={headMessage}
                    onChange={(e) => setHeadMessage(e.target.value)}
                    placeholder="A short message displayed at the top of your profile."
                    rows={2}
                    className="w-full px-4 py-3 rounded-lg neu-input resize-none"
                  />
                </div>
              </div>

              {/* Health Info Section */}
              <div className="neu-card rounded-xl p-4 md:p-6">
                <h2 className="text-sm font-semibold neu-text-primary flex items-center gap-2 mb-4">
                  <HeartPulse size={16} className="neu-text-secondary" />
                  Health Info
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium neu-text-secondary mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={healthInfo.date_of_birth ?? ""}
                      onChange={(e) =>
                        setHealthInfo((prev) => ({
                          ...prev,
                          date_of_birth: e.target.value || undefined,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-lg neu-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium neu-text-secondary mb-1">
                      Blood Type
                    </label>
                    <select
                      value={healthInfo.blood_type ?? ""}
                      onChange={(e) =>
                        setHealthInfo((prev) => ({
                          ...prev,
                          blood_type: (e.target.value || undefined) as
                            | HealthInfo["blood_type"]
                            | undefined,
                        }))
                      }
                      className="w-full px-4 py-3 rounded-lg neu-input"
                    >
                      <option value="">—</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="O">O</option>
                      <option value="AB">AB</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium neu-text-secondary mb-1">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      value={healthInfo.height_cm ?? ""}
                      onChange={(e) =>
                        setHealthInfo((prev) => ({
                          ...prev,
                          height_cm: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }))
                      }
                      placeholder="170"
                      min={0}
                      max={300}
                      className="w-full px-4 py-3 rounded-lg neu-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium neu-text-secondary mb-1">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      value={healthInfo.weight_kg ?? ""}
                      onChange={(e) =>
                        setHealthInfo((prev) => ({
                          ...prev,
                          weight_kg: e.target.value
                            ? Number(e.target.value)
                            : null,
                        }))
                      }
                      placeholder="65"
                      min={0}
                      max={500}
                      className="w-full px-4 py-3 rounded-lg neu-input"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium neu-text-secondary mb-1">
                      Allergies
                    </label>
                    <textarea
                      value={healthInfo.allergies ?? ""}
                      onChange={(e) =>
                        setHealthInfo((prev) => ({
                          ...prev,
                          allergies: e.target.value || undefined,
                        }))
                      }
                      placeholder="e.g. peanuts, penicillin"
                      rows={2}
                      className="w-full px-4 py-3 rounded-lg neu-input resize-none"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium neu-text-secondary mb-1">
                      Medical Notes
                    </label>
                    <textarea
                      value={healthInfo.medical_notes ?? ""}
                      onChange={(e) =>
                        setHealthInfo((prev) => ({
                          ...prev,
                          medical_notes: e.target.value || undefined,
                        }))
                      }
                      placeholder="Medications, conditions, etc."
                      rows={2}
                      className="w-full px-4 py-3 rounded-lg neu-input resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Social Links Section */}
              <div className="neu-card rounded-xl p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                    <LinkIcon size={16} className="neu-text-secondary" />
                    Social Links
                  </h2>
                  <button
                    onClick={handleOpenAddSocialLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </div>

                <div className="space-y-3">
                  {(profile?.social_links || []).length === 0 ? (
                    <div className="text-center py-8">
                      <Link2
                        size={32}
                        className="mx-auto neu-text-muted mb-2"
                      />
                      <p className="text-sm neu-text-secondary">
                        No social links added yet
                      </p>
                    </div>
                  ) : (
                    (profile?.social_links || []).map((link) => {
                      if (!link) return null;
                      return (
                        <div
                          key={link.id}
                          className="flex items-center justify-between p-3 border-b border-slate-200 last:border-b-0"
                        >
                          <div className="flex items-center gap-3 overflow-hidden flex-1">
                            <div className="p-2 bg-slate-100 rounded-full neu-text-secondary shrink-0">
                              {getSocialIcon(link.platform)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium neu-text-primary flex items-center gap-2">
                                {getSocialLabel(link.platform)}
                                {link.username && (
                                  <span className="text-xs neu-text-secondary font-normal">
                                    @{link.username}
                                  </span>
                                )}
                              </div>
                              <a
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline truncate block"
                              >
                                {link.url}
                              </a>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleEditSocialLink(link)}
                              className="p-2 neu-text-muted hover:text-teal-500 transition-colors"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeleteId(link.id)}
                              className="p-2 neu-text-muted hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add/Edit Social Link Modal */}
                {isSocialModalOpen &&
                  createPortal(
                    <div
                      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                      style={{
                        paddingTop:
                          "calc(4rem + env(safe-area-inset-top, 0px))",
                        paddingBottom:
                          "calc(5rem + env(safe-area-inset-bottom, 0px))",
                      }}
                      onClick={(e) => {
                        if (e.target === e.currentTarget) {
                          setIsSocialModalOpen(false);
                          setEditingSocialLinkId(null);
                          setSocialLinkInput({
                            platform: "website",
                            url: "",
                            username: "",
                          });
                        }
                      }}
                    >
                      <div className="neu-modal w-full max-w-sm p-6 max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
                        <h3 className="text-lg font-semibold neu-text-primary mb-4">
                          {editingSocialLinkId
                            ? "Edit Social Link"
                            : "Add Social Link"}
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-1.5">
                              Platform
                            </label>
                            <select
                              value={socialLinkInput.platform}
                              onChange={(e) =>
                                setSocialLinkInput({
                                  ...socialLinkInput,
                                  platform: e.target
                                    .value as SocialLink["platform"],
                                })
                              }
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            >
                              <option value="website">Website / Blog</option>
                              <option value="x">X (Twitter)</option>
                              <option value="instagram">Instagram</option>
                              <option value="facebook">Facebook</option>
                              <option value="linkedin">LinkedIn</option>
                              <option value="github">GitHub</option>
                              <option value="youtube">YouTube</option>
                              <option value="tiktok">TikTok</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <UrlInput
                              label="URL *"
                              value={socialLinkInput.url || ""}
                              onChange={(value) =>
                                setSocialLinkInput({
                                  ...socialLinkInput,
                                  url: value,
                                })
                              }
                              placeholder="https://..."
                              required
                              showValidation={false}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-1.5">
                              Username (Optional)
                            </label>
                            <input
                              type="text"
                              value={socialLinkInput.username || ""}
                              onChange={(e) =>
                                setSocialLinkInput({
                                  ...socialLinkInput,
                                  username: e.target.value,
                                })
                              }
                              placeholder="@username"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              onClick={() => {
                                setIsSocialModalOpen(false);
                                setEditingSocialLinkId(null);
                                setSocialLinkInput({
                                  platform: "website",
                                  url: "",
                                  username: "",
                                });
                              }}
                              className="px-4 py-2 neu-text-secondary neu-btn rounded-lg text-sm"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveSocialLink}
                              disabled={!socialLinkInput.url}
                              className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {editingSocialLinkId ? "Save" : "Add Link"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}
                {pendingDeleteId &&
                  createPortal(
                    <div
                      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                      style={{
                        paddingTop:
                          "calc(4rem + env(safe-area-inset-top, 0px))",
                        paddingBottom:
                          "calc(5rem + env(safe-area-inset-bottom, 0px))",
                      }}
                      onClick={(e) => {
                        if (e.target === e.currentTarget)
                          setPendingDeleteId(null);
                      }}
                    >
                      <div className="neu-modal w-full max-w-sm p-6 max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
                        <h3 className="text-lg font-semibold neu-text-primary mb-2">
                          Remove link?
                        </h3>
                        <p className="text-sm neu-text-secondary mb-4">
                          This will delete the selected social link.
                        </p>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingDeleteId(null)}
                            className="px-4 py-2 neu-text-secondary neu-btn rounded-lg text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmRemoveSocialLink}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}
                {pendingProfileDelete &&
                  createPortal(
                    <div
                      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                      style={{
                        paddingTop:
                          "calc(4rem + env(safe-area-inset-top, 0px))",
                        paddingBottom:
                          "calc(5rem + env(safe-area-inset-bottom, 0px))",
                      }}
                      onClick={(e) => {
                        if (e.target === e.currentTarget)
                          setPendingProfileDelete(null);
                      }}
                    >
                      <div className="neu-modal w-full max-w-sm p-6 max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
                        <h3 className="text-lg font-semibold neu-text-primary mb-2">
                          Delete this {deleteTargetLabel}?
                        </h3>
                        <p className="text-sm neu-text-secondary mb-4">
                          This will remove the selected entry.
                        </p>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingProfileDelete(null)}
                            className="px-4 py-2 neu-text-secondary neu-btn rounded-lg text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmProfileDelete}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}
                {pendingSkillDelete &&
                  createPortal(
                    <div
                      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                      style={{
                        paddingTop:
                          "calc(4rem + env(safe-area-inset-top, 0px))",
                        paddingBottom:
                          "calc(5rem + env(safe-area-inset-bottom, 0px))",
                      }}
                      onClick={(e) => {
                        if (e.target === e.currentTarget)
                          setPendingSkillDelete(null);
                      }}
                    >
                      <div className="neu-modal w-full max-w-sm p-6 max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
                        <h3 className="text-lg font-semibold neu-text-primary mb-2">
                          Delete Skill
                        </h3>
                        <p className="text-sm neu-text-secondary mb-4">
                          Are you sure you want to delete &quot;
                          {pendingSkillDelete.name}&quot;?
                        </p>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setPendingSkillDelete(null)}
                            className="px-4 py-2 neu-text-secondary neu-btn rounded-lg text-sm"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteSkill(pendingSkillDelete.id);
                              setPendingSkillDelete(null);
                            }}
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>,
                    document.body,
                  )}
              </div>
            </div>

            {/* Work Experience Section */}
            <div className="neu-card rounded-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                  <Briefcase size={16} className="neu-text-secondary" />
                  Work Experience
                </h2>
                <button
                  onClick={handleAddExperience}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

              {localExperiences.length === 0 ? (
                <div className="text-center py-8 neu-text-secondary">
                  <Briefcase size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No work experience yet</p>
                  <p className="text-xs mt-1 neu-text-muted">
                    Click "Add" to add work experience
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localExperiences.map((exp) => (
                    <div
                      key={exp.id}
                      className="neu-pressed rounded-lg overflow-hidden"
                    >
                      {/* Experience Header */}
                      <button
                        onClick={() =>
                          setExpandedExpId(
                            expandedExpId === exp.id ? null : exp.id,
                          )
                        }
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium neu-text-primary truncate">
                            {exp.title || "Title not set"}
                          </div>
                          <div className="text-sm neu-text-secondary truncate">
                            {exp.company || "Company not set"}
                            {exp.start_year &&
                              ` • ${exp.start_year}/${exp.start_month ? `${exp.start_month}` : ""}`}
                            {exp.is_current
                              ? " - Present"
                              : exp.end_year
                                ? ` - ${exp.end_year}/${exp.end_month ? `${exp.end_month}` : ""}`
                                : ""}
                          </div>
                        </div>
                        {expandedExpId === exp.id ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </button>

                      {/* Expanded Content */}
                      {expandedExpId === exp.id && (
                        <div className="p-4 space-y-4 bg-slate-50">
                          {/* Title */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Title/Position *
                            </label>
                            <input
                              type="text"
                              value={exp.title}
                              onChange={(e) =>
                                handleUpdateExperience(
                                  exp.id,
                                  "title",
                                  e.target.value,
                                )
                              }
                              placeholder="Software Engineer"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Employment Type */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Employment Type
                            </label>
                            <select
                              value={exp.employment_type}
                              onChange={(e) =>
                                handleUpdateExperience(
                                  exp.id,
                                  "employment_type",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            >
                              {employmentTypeOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Company */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                              <Building2 size={14} className="neu-text-muted" />
                              Company/Organization *
                            </label>
                            <input
                              type="text"
                              value={exp.company}
                              onChange={(e) =>
                                handleUpdateExperience(
                                  exp.id,
                                  "company",
                                  e.target.value,
                                )
                              }
                              placeholder="Company Inc."
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Location */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                              <MapPin size={14} className="neu-text-muted" />
                              Location
                            </label>
                            <input
                              type="text"
                              value={exp.location}
                              onChange={(e) =>
                                handleUpdateExperience(
                                  exp.id,
                                  "location",
                                  e.target.value,
                                )
                              }
                              placeholder="New York, NY"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Date Range */}
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                            {/* Start Date */}
                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                                <Calendar
                                  size={14}
                                  className="neu-text-muted"
                                />
                                Start{" "}
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={exp.start_year || ""}
                                  onChange={(e) =>
                                    handleUpdateExperience(
                                      exp.id,
                                      "start_year",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  className="flex-1 px-2 py-2 rounded-lg neu-input text-sm"
                                >
                                  {yearOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={exp.start_month || ""}
                                  onChange={(e) =>
                                    handleUpdateExperience(
                                      exp.id,
                                      "start_month",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  className="w-24 px-2 py-2 rounded-lg neu-input text-sm"
                                >
                                  {monthOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* End Date */}
                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2">
                                End{" "}
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={exp.end_year || ""}
                                  onChange={(e) =>
                                    handleUpdateExperience(
                                      exp.id,
                                      "end_year",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  disabled={exp.is_current}
                                  className="flex-1 px-2 py-2 rounded-lg neu-input text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {yearOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={exp.end_month || ""}
                                  onChange={(e) =>
                                    handleUpdateExperience(
                                      exp.id,
                                      "end_month",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  disabled={exp.is_current}
                                  className="w-24 px-2 py-2 rounded-lg neu-input text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {monthOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Is Current */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={exp.is_current}
                              onChange={(e) =>
                                handleUpdateExperience(
                                  exp.id,
                                  "is_current",
                                  e.target.checked,
                                )
                              }
                              className="w-4 h-4 text-sky-500 border-slate-300 rounded focus:ring-sky-500"
                            />
                            <span className="text-sm neu-text-primary">
                              Currently working here
                            </span>
                          </label>

                          {/* Description */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Description
                            </label>
                            <textarea
                              value={exp.description}
                              onChange={(e) =>
                                handleUpdateExperience(
                                  exp.id,
                                  "description",
                                  e.target.value,
                                )
                              }
                              placeholder="Describe your responsibilities and achievements..."
                              rows={4}
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm resize-none"
                            />
                          </div>

                          {/* Skills */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Skills
                            </label>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {(exp.skills || []).map((skill, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-700 text-xs font-medium rounded-full"
                                >
                                  {skill}
                                  <button
                                    onClick={() =>
                                      handleRemoveSkill(exp.id, idx)
                                    }
                                    className="hover:text-teal-900"
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={skillInput[exp.id] || ""}
                                onChange={(e) =>
                                  setSkillInput({
                                    ...skillInput,
                                    [exp.id]: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (
                                    e.key === "Enter" &&
                                    !e.nativeEvent.isComposing
                                  ) {
                                    e.preventDefault();
                                    handleAddSkill(exp.id);
                                  }
                                }}
                                placeholder="Type skill and press Enter"
                                className="flex-1 px-3 py-2 rounded-lg neu-input text-sm"
                              />
                              <button
                                onClick={() => handleAddSkill(exp.id)}
                                className="px-3 py-2 neu-btn neu-text-primary rounded-lg text-sm"
                              >
                                Add
                              </button>
                            </div>
                          </div>

                          {/* Media */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                              <LinkIcon size={14} className="neu-text-muted" />
                              Media (URL)
                            </label>
                            <input
                              type="text"
                              value={exp.media_title}
                              onChange={(e) =>
                                handleUpdateExperience(
                                  exp.id,
                                  "media_title",
                                  e.target.value,
                                )
                              }
                              placeholder="Media title"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm mb-2"
                            />
                            <UrlInput
                              value={exp.media_url}
                              onChange={(value) =>
                                handleUpdateExperience(
                                  exp.id,
                                  "media_url",
                                  value,
                                )
                              }
                              placeholder="https://..."
                              showValidation={false}
                            />
                          </div>

                          {/* Delete Button */}
                          <div className="pt-4 border-t border-slate-300">
                            <button
                              type="button"
                              onClick={() =>
                                setPendingProfileDelete({
                                  type: "work_experience",
                                  id: exp.id,
                                })
                              }
                              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                            >
                              <Trash2 size={16} />
                              Delete this entry
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Education Section */}
            <div className="neu-card rounded-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                  <GraduationCap size={16} className="neu-text-secondary" />
                  Education
                </h2>
                <button
                  onClick={handleAddEducation}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

              {localEducations.length === 0 ? (
                <div className="text-center py-8 neu-text-secondary">
                  <GraduationCap
                    size={32}
                    className="mx-auto mb-2 opacity-50"
                  />
                  <p className="text-sm">No education yet</p>
                  <p className="text-xs mt-1 neu-text-muted">
                    Click "Add" to add education
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localEducations.map((edu) => (
                    <div
                      key={edu.id}
                      className="neu-pressed rounded-lg overflow-hidden"
                    >
                      {/* Education Header */}
                      <button
                        onClick={() =>
                          setExpandedEduId(
                            expandedEduId === edu.id ? null : edu.id,
                          )
                        }
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium neu-text-primary truncate">
                            {edu.school || "School not set"}
                          </div>
                          <div className="text-sm neu-text-secondary truncate">
                            {edu.degree &&
                              degreeOptions.find((d) => d.value === edu.degree)
                                ?.label}
                            {edu.field_of_study && ` - ${edu.field_of_study}`}
                            {edu.start_year && ` • ${edu.start_year}/`}
                            {edu.is_current
                              ? " - Current"
                              : edu.end_year
                                ? ` - ${edu.end_year}/`
                                : ""}
                          </div>
                        </div>
                        {expandedEduId === edu.id ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </button>

                      {/* Expanded Content */}
                      {expandedEduId === edu.id && (
                        <div className="p-4 space-y-4 bg-slate-50">
                          {/* School */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                              <GraduationCap
                                size={14}
                                className="neu-text-muted"
                              />
                              School Name *
                            </label>
                            <input
                              type="text"
                              value={edu.school}
                              onChange={(e) =>
                                handleUpdateEducation(
                                  edu.id,
                                  "school",
                                  e.target.value,
                                )
                              }
                              placeholder="University Name"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Degree */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Degree
                            </label>
                            <select
                              value={edu.degree}
                              onChange={(e) =>
                                handleUpdateEducation(
                                  edu.id,
                                  "degree",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            >
                              {degreeOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Field of Study */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                              <BookOpen size={14} className="neu-text-muted" />
                              Field of Study
                            </label>
                            <input
                              type="text"
                              value={edu.field_of_study}
                              onChange={(e) =>
                                handleUpdateEducation(
                                  edu.id,
                                  "field_of_study",
                                  e.target.value,
                                )
                              }
                              placeholder="Economics"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Date Range */}
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                            {/* Start Date */}
                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                                <Calendar
                                  size={14}
                                  className="neu-text-muted"
                                />
                                Start{" "}
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={edu.start_year || ""}
                                  onChange={(e) =>
                                    handleUpdateEducation(
                                      edu.id,
                                      "start_year",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  className="flex-1 px-2 py-2 rounded-lg neu-input text-sm"
                                >
                                  {yearOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={edu.start_month || ""}
                                  onChange={(e) =>
                                    handleUpdateEducation(
                                      edu.id,
                                      "start_month",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  className="w-24 px-2 py-2 rounded-lg neu-input text-sm"
                                >
                                  {monthOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* End Date */}
                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2">
                                Graduation{" "}
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={edu.end_year || ""}
                                  onChange={(e) =>
                                    handleUpdateEducation(
                                      edu.id,
                                      "end_year",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  disabled={edu.is_current}
                                  className="flex-1 px-2 py-2 rounded-lg neu-input text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {yearOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={edu.end_month || ""}
                                  onChange={(e) =>
                                    handleUpdateEducation(
                                      edu.id,
                                      "end_month",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  disabled={edu.is_current}
                                  className="w-24 px-2 py-2 rounded-lg neu-input text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {monthOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          {/* Is Current */}
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={edu.is_current}
                              onChange={(e) =>
                                handleUpdateEducation(
                                  edu.id,
                                  "is_current",
                                  e.target.checked,
                                )
                              }
                              className="w-4 h-4 text-sky-500 border-slate-300 rounded focus:ring-sky-500"
                            />
                            <span className="text-sm neu-text-primary">
                              Currently enrolled
                            </span>
                          </label>

                          {/* Grade */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Grade/GPA
                            </label>
                            <input
                              type="text"
                              value={edu.grade}
                              onChange={(e) =>
                                handleUpdateEducation(
                                  edu.id,
                                  "grade",
                                  e.target.value,
                                )
                              }
                              placeholder="GPA 3.5"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Activities */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Activities/Clubs
                            </label>
                            <input
                              type="text"
                              value={edu.activities}
                              onChange={(e) =>
                                handleUpdateEducation(
                                  edu.id,
                                  "activities",
                                  e.target.value,
                                )
                              }
                              placeholder="Soccer team, Student council, etc."
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Description */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Description
                            </label>
                            <textarea
                              value={edu.description}
                              onChange={(e) =>
                                handleUpdateEducation(
                                  edu.id,
                                  "description",
                                  e.target.value,
                                )
                              }
                              placeholder="What you learned, research topics, etc."
                              rows={3}
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm resize-none"
                            />
                          </div>

                          {/* Delete Button */}
                          <div className="pt-4 border-t border-slate-300">
                            <button
                              type="button"
                              onClick={() =>
                                setPendingProfileDelete({
                                  type: "education",
                                  id: edu.id,
                                })
                              }
                              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                            >
                              <Trash2 size={16} />
                              Delete this entry
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Skills Section */}
            <div className="neu-card rounded-xl p-4 md:p-6">
              <h2 className="text-sm font-semibold neu-text-primary mb-4 flex items-center gap-2">
                <Sparkles size={16} className="neu-text-secondary" />
                Skills
              </h2>

              {/* All Skills Display */}
              <div className="flex flex-wrap gap-2 mb-4">
                {allSkills.map((skillName, idx) => {
                  if (!skillName) return null;
                  const isFromExperience =
                    workExperienceSkills.includes(skillName);
                  const ownSkill = skills.find((s) => s.name === skillName);

                  return (
                    <div
                      key={idx}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${
                        isFromExperience && !ownSkill
                          ? "neu-pressed neu-text-secondary"
                          : "bg-teal-100 text-teal-700"
                      }`}
                    >
                      {skillName}
                      {ownSkill && (
                        <button
                          onClick={() =>
                            setPendingSkillDelete({
                              id: ownSkill.id,
                              name: skillName,
                            })
                          }
                          className="ml-1 hover:text-red-600"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
                {allSkills.length === 0 && (
                  <div className="text-center py-8">
                    <Star size={32} className="mx-auto neu-text-muted mb-2" />
                    <p className="text-sm neu-text-secondary">No skills yet</p>
                  </div>
                )}
              </div>

              {/* Add Skill Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSkillInput}
                  onChange={(e) => setNewSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleAddNewSkill();
                    }
                  }}
                  placeholder="Add a skill..."
                  className="flex-1 px-3 py-2 rounded-lg neu-input text-sm"
                />
                <button
                  onClick={handleAddNewSkill}
                  className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm font-medium"
                >
                  Add
                </button>
              </div>

              <p className="mt-3 text-xs neu-text-muted">
                Skills added in work experience are also shown (gray background)
              </p>
            </div>

            {/* Certifications Section */}
            <div className="neu-card rounded-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                  <Award size={16} className="neu-text-secondary" />
                  Certifications
                </h2>
                <button
                  onClick={handleAddCertification}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

              {localCertifications.length === 0 ? (
                <div className="text-center py-8 neu-text-secondary">
                  <Award size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No certifications yet</p>
                  <p className="text-xs mt-1 neu-text-muted">
                    Click "Add" to add certifications
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localCertifications.map((cert) => (
                    <div
                      key={cert.id}
                      className="neu-pressed rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedCertId(
                            expandedCertId === cert.id ? null : cert.id,
                          )
                        }
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium neu-text-primary truncate">
                            {cert.name || "Certification not set"}
                          </div>
                          <div className="text-sm neu-text-secondary truncate">
                            {cert.issuing_organization}
                            {cert.issue_year &&
                              ` • ${cert.issue_year}/${cert.issue_month ? `${cert.issue_month}` : ""} obtained`}
                          </div>
                        </div>
                        {expandedCertId === cert.id ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </button>

                      {expandedCertId === cert.id && (
                        <div className="p-4 space-y-4 bg-slate-50">
                          {/* Name */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Certification Name *
                            </label>
                            <input
                              type="text"
                              value={cert.name}
                              onChange={(e) =>
                                handleUpdateCertification(
                                  cert.id,
                                  "name",
                                  e.target.value,
                                )
                              }
                              placeholder="AWS Certified Solutions Architect"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Issuing Organization */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Issuing Organization
                            </label>
                            <input
                              type="text"
                              value={cert.issuing_organization}
                              onChange={(e) =>
                                handleUpdateCertification(
                                  cert.id,
                                  "issuing_organization",
                                  e.target.value,
                                )
                              }
                              placeholder="IPA"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Issue Date */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                                <Calendar
                                  size={14}
                                  className="neu-text-muted"
                                />
                                obtained/{" "}
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={cert.issue_year || ""}
                                  onChange={(e) =>
                                    handleUpdateCertification(
                                      cert.id,
                                      "issue_year",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  className="flex-1 px-2 py-2 rounded-lg neu-input text-sm"
                                >
                                  {yearOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={cert.issue_month || ""}
                                  onChange={(e) =>
                                    handleUpdateCertification(
                                      cert.id,
                                      "issue_month",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  className="w-24 px-2 py-2 rounded-lg neu-input text-sm"
                                >
                                  {monthOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2">
                                Expiry
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={cert.expiry_year || ""}
                                  onChange={(e) =>
                                    handleUpdateCertification(
                                      cert.id,
                                      "expiry_year",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  disabled={cert.has_no_expiry}
                                  className="flex-1 px-2 py-2 rounded-lg neu-input text-sm disabled:opacity-50"
                                >
                                  {yearOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={cert.expiry_month || ""}
                                  onChange={(e) =>
                                    handleUpdateCertification(
                                      cert.id,
                                      "expiry_month",
                                      e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                    )
                                  }
                                  disabled={cert.has_no_expiry}
                                  className="w-24 px-2 py-2 rounded-lg neu-input text-sm disabled:opacity-50"
                                >
                                  {monthOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cert.has_no_expiry}
                              onChange={(e) =>
                                handleUpdateCertification(
                                  cert.id,
                                  "has_no_expiry",
                                  e.target.checked,
                                )
                              }
                              className="w-4 h-4 text-sky-500 border-slate-300 rounded focus:ring-sky-500"
                            />
                            <span className="text-sm neu-text-primary">
                              No expiration
                            </span>
                          </label>

                          {/* Credential ID */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Credential ID
                            </label>
                            <input
                              type="text"
                              value={cert.credential_id}
                              onChange={(e) =>
                                handleUpdateCertification(
                                  cert.id,
                                  "credential_id",
                                  e.target.value,
                                )
                              }
                              placeholder="XX-XXXXXX"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Credential URL */}
                          <div>
                            <UrlInput
                              label="Credential URL"
                              value={cert.credential_url}
                              onChange={(value) =>
                                handleUpdateCertification(
                                  cert.id,
                                  "credential_url",
                                  value,
                                )
                              }
                              placeholder="https://..."
                              showValidation={false}
                            />
                          </div>

                          {/* Photo & OCR */}
                          <div className="space-y-3">
                            <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                              <Camera size={14} className="neu-text-muted" />
                              Certificate Photo
                            </label>
                            <div className="flex items-center gap-3">
                              <input
                                ref={certFileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  certFileRef.current = file;
                                  await uploadPhoto(cert.id, file);
                                  const url = URL.createObjectURL(file);
                                  setCertPhotoUrls((prev) => ({
                                    ...prev,
                                    [cert.id]: url,
                                  }));
                                }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  certFileInputRef.current?.click()
                                }
                                className="flex items-center gap-2 px-3 py-2 rounded-lg neu-flat text-sm neu-text-primary hover:bg-slate-100 transition-colors"
                              >
                                <Camera size={16} />
                                {cert.photo_storage_path
                                  ? "Change Photo"
                                  : "Upload Photo"}
                              </button>
                              {(cert.photo_storage_path ||
                                certPhotoUrls[cert.id]) && (
                                <button
                                  type="button"
                                  disabled={isOcrRunning === cert.id}
                                  onClick={async () => {
                                    setIsOcrRunning(cert.id);
                                    try {
                                      let file = certFileRef.current;
                                      if (!file && cert.photo_storage_path) {
                                        const url = await getPhotoSignedUrl(
                                          cert.photo_storage_path,
                                        );
                                        if (url) {
                                          const res = await fetch(url);
                                          const blob = await res.blob();
                                          file = new File([blob], "cert.jpg", {
                                            type: blob.type,
                                          });
                                        }
                                      }
                                      if (file) {
                                        const result = await runOcr(
                                          cert.id,
                                          file,
                                        );
                                        if (result) {
                                          setOcrResult({
                                            certId: cert.id,
                                            data: result,
                                          });
                                        }
                                      }
                                    } finally {
                                      setIsOcrRunning(null);
                                    }
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-100 text-violet-700 text-sm font-medium hover:bg-violet-200 transition-colors disabled:opacity-50"
                                >
                                  {isOcrRunning === cert.id ? (
                                    <Loader2
                                      size={16}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <ScanLine size={16} />
                                  )}
                                  Run OCR
                                </button>
                              )}
                            </div>

                            {/* Thumbnail */}
                            {(certPhotoUrls[cert.id] ||
                              cert.photo_storage_path) && (
                              <PhotoThumbnail
                                certId={cert.id}
                                localUrl={certPhotoUrls[cert.id]}
                                storagePath={cert.photo_storage_path}
                                getSignedUrl={getPhotoSignedUrl}
                              />
                            )}

                            {/* OCR Result Preview */}
                            {ocrResult?.certId === cert.id && (
                              <div className="rounded-lg bg-violet-50 border border-violet-200 p-4 space-y-2">
                                <div className="text-sm font-medium text-violet-800 flex items-center gap-2">
                                  <ScanLine size={14} />
                                  OCR Result
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                  {!!ocrResult.data.name && (
                                    <>
                                      <span className="text-violet-600">
                                        Name:
                                      </span>
                                      <span className="neu-text-primary">
                                        {String(ocrResult.data.name)}
                                      </span>
                                    </>
                                  )}
                                  {!!ocrResult.data.issuingOrganization && (
                                    <>
                                      <span className="text-violet-600">
                                        Organization:
                                      </span>
                                      <span className="neu-text-primary">
                                        {String(
                                          ocrResult.data.issuingOrganization,
                                        )}
                                      </span>
                                    </>
                                  )}
                                  {!!ocrResult.data.issueDate && (
                                    <>
                                      <span className="text-violet-600">
                                        Issue Date:
                                      </span>
                                      <span className="neu-text-primary">
                                        {String(ocrResult.data.issueDate)}
                                      </span>
                                    </>
                                  )}
                                  {!!ocrResult.data.expiryDate && (
                                    <>
                                      <span className="text-violet-600">
                                        Expiry Date:
                                      </span>
                                      <span className="neu-text-primary">
                                        {String(ocrResult.data.expiryDate)}
                                      </span>
                                    </>
                                  )}
                                  {!!ocrResult.data.credentialId && (
                                    <>
                                      <span className="text-violet-600">
                                        Credential ID:
                                      </span>
                                      <span className="neu-text-primary">
                                        {String(ocrResult.data.credentialId)}
                                      </span>
                                    </>
                                  )}
                                </div>
                                <div className="flex gap-2 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const d = ocrResult.data;
                                      if (d.name) {
                                        handleUpdateCertification(
                                          cert.id,
                                          "name",
                                          String(d.name),
                                        );
                                      }
                                      if (d.issuingOrganization) {
                                        handleUpdateCertification(
                                          cert.id,
                                          "issuing_organization",
                                          String(d.issuingOrganization),
                                        );
                                      }
                                      if (d.issueDate) {
                                        const parts = String(d.issueDate).split(
                                          "-",
                                        );
                                        if (parts[0]) {
                                          handleUpdateCertification(
                                            cert.id,
                                            "issue_year",
                                            Number(parts[0]),
                                          );
                                        }
                                        if (parts[1]) {
                                          handleUpdateCertification(
                                            cert.id,
                                            "issue_month",
                                            Number(parts[1]),
                                          );
                                        }
                                      }
                                      if (d.expiryDate) {
                                        const parts = String(
                                          d.expiryDate,
                                        ).split("-");
                                        if (parts[0]) {
                                          handleUpdateCertification(
                                            cert.id,
                                            "expiry_year",
                                            Number(parts[0]),
                                          );
                                        }
                                        if (parts[1]) {
                                          handleUpdateCertification(
                                            cert.id,
                                            "expiry_month",
                                            Number(parts[1]),
                                          );
                                        }
                                      }
                                      if (d.credentialId) {
                                        handleUpdateCertification(
                                          cert.id,
                                          "credential_id",
                                          String(d.credentialId),
                                        );
                                      }
                                      setOcrResult(null);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors"
                                  >
                                    <Check size={14} />
                                    Apply
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setOcrResult(null)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg neu-flat text-sm neu-text-secondary hover:bg-slate-100 transition-colors"
                                  >
                                    <X size={14} />
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Delete Button */}
                          <div className="pt-4 border-t border-slate-300">
                            <button
                              type="button"
                              onClick={() =>
                                setPendingProfileDelete({
                                  type: "certification",
                                  id: cert.id,
                                })
                              }
                              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                            >
                              <Trash2 size={16} />
                              Delete this entry
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Languages Section */}
            <div className="neu-card rounded-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                  <Globe size={16} className="neu-text-secondary" />
                  Languages
                </h2>
                <button
                  onClick={handleAddLanguage}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

              {localLanguages.length === 0 ? (
                <div className="text-center py-8 neu-text-secondary">
                  <Globe size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No languages yet</p>
                  <p className="text-xs mt-1 neu-text-muted">
                    Click "Add" to add languages
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localLanguages.map((lang) => (
                    <div
                      key={lang.id}
                      className="neu-pressed rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedLangId(
                            expandedLangId === lang.id ? null : lang.id,
                          )
                        }
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium neu-text-primary truncate">
                            {lang.name || "Language not set"}
                          </div>
                          <div className="text-sm neu-text-secondary truncate">
                            {lang.proficiency &&
                              languageProficiencyOptions.find(
                                (p) => p.value === lang.proficiency,
                              )?.label}
                          </div>
                        </div>
                        {expandedLangId === lang.id ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </button>

                      {expandedLangId === lang.id && (
                        <div className="p-4 space-y-4 bg-slate-50">
                          {/* Name */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Language *
                            </label>
                            <input
                              type="text"
                              value={lang.name}
                              onChange={(e) =>
                                handleUpdateLanguage(
                                  lang.id,
                                  "name",
                                  e.target.value,
                                )
                              }
                              placeholder="English"
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            />
                          </div>

                          {/* Proficiency */}
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-2">
                              Proficiency
                            </label>
                            <select
                              value={lang.proficiency}
                              onChange={(e) =>
                                handleUpdateLanguage(
                                  lang.id,
                                  "proficiency",
                                  e.target.value,
                                )
                              }
                              className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                            >
                              {languageProficiencyOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Delete Button */}
                          <div className="pt-4 border-t border-slate-300">
                            <button
                              type="button"
                              onClick={() =>
                                setPendingProfileDelete({
                                  type: "language",
                                  id: lang.id,
                                })
                              }
                              className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                            >
                              <Trash2 size={16} />
                              Delete this entry
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Affiliations Section */}
            <div className="neu-card rounded-xl p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-6">
                <h2 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                  <Users size={16} className="neu-text-secondary" />
                  Affiliations
                </h2>
                <button
                  onClick={handleAddAffiliation}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors"
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

              {localAffiliations.length === 0 ? (
                <div className="text-center py-8 neu-text-secondary">
                  <Users size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No affiliations yet</p>
                  <p className="text-xs mt-1 neu-text-muted">
                    Click "Add" to add affiliations
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localAffiliations.map((aff) => {
                    const isProtected =
                      aff.is_protected || isProtectedAffiliation(aff.name);

                    return (
                      <div
                        key={aff.id}
                        className="neu-pressed rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() =>
                            setExpandedAffId(
                              expandedAffId === aff.id ? null : aff.id,
                            )
                          }
                          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            {isProtected && (
                              <Lock
                                size={14}
                                className="text-amber-500 shrink-0"
                              />
                            )}
                            <div>
                              <div className="font-medium neu-text-primary truncate">
                                {aff.name || "Organization not set"}
                              </div>
                              <div className="text-sm neu-text-secondary truncate">
                                {aff.role && `${aff.role} • `}
                                {aff.is_current
                                  ? "Currently member"
                                  : aff.end_year
                                    ? `until ${aff.end_year}`
                                    : ""}
                              </div>
                            </div>
                          </div>
                          {expandedAffId === aff.id ? (
                            <ChevronUp size={20} />
                          ) : (
                            <ChevronDown size={20} />
                          )}
                        </button>

                        {expandedAffId === aff.id && (
                          <div className="p-4 space-y-4 bg-slate-50">
                            {/* Name */}
                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                                <Users size={14} className="neu-text-muted" />
                                Organization *
                                {isProtected && (
                                  <span className="text-xs text-amber-600 flex items-center gap-1">
                                    <Lock size={10} /> Protected
                                  </span>
                                )}
                              </label>
                              <input
                                type="text"
                                value={aff.name}
                                onChange={(e) =>
                                  handleUpdateAffiliation(
                                    aff.id,
                                    "name",
                                    e.target.value,
                                  )
                                }
                                placeholder="Organization name"
                                disabled={isProtected}
                                className="w-full px-3 py-2 rounded-lg neu-input text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                            </div>

                            {/* Role */}
                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2">
                                Role/Position
                              </label>
                              <input
                                type="text"
                                value={aff.role}
                                onChange={(e) =>
                                  handleUpdateAffiliation(
                                    aff.id,
                                    "role",
                                    e.target.value,
                                  )
                                }
                                placeholder="Member, Leader, etc."
                                className="w-full px-3 py-2 rounded-lg neu-input text-sm"
                              />
                            </div>

                            {/* Date Range */}
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                              {/* Start Date */}
                              <div>
                                <label className="block text-sm font-medium neu-text-primary mb-2 flex items-center gap-2">
                                  <Calendar
                                    size={14}
                                    className="neu-text-muted"
                                  />
                                  Start{" "}
                                </label>
                                <div className="flex gap-2">
                                  <select
                                    value={aff.start_year || ""}
                                    onChange={(e) =>
                                      handleUpdateAffiliation(
                                        aff.id,
                                        "start_year",
                                        e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      )
                                    }
                                    className="flex-1 px-2 py-2 rounded-lg neu-input text-sm"
                                  >
                                    {yearOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={aff.start_month || ""}
                                    onChange={(e) =>
                                      handleUpdateAffiliation(
                                        aff.id,
                                        "start_month",
                                        e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      )
                                    }
                                    className="w-24 px-2 py-2 rounded-lg neu-input text-sm"
                                  >
                                    {monthOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* End Date */}
                              <div>
                                <label className="block text-sm font-medium neu-text-primary mb-2">
                                  End{" "}
                                </label>
                                <div className="flex gap-2">
                                  <select
                                    value={aff.end_year || ""}
                                    onChange={(e) =>
                                      handleUpdateAffiliation(
                                        aff.id,
                                        "end_year",
                                        e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      )
                                    }
                                    disabled={aff.is_current}
                                    className="flex-1 px-2 py-2 rounded-lg neu-input text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {yearOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={aff.end_month || ""}
                                    onChange={(e) =>
                                      handleUpdateAffiliation(
                                        aff.id,
                                        "end_month",
                                        e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      )
                                    }
                                    disabled={aff.is_current}
                                    className="w-24 px-2 py-2 rounded-lg neu-input text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {monthOptions.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>

                            {/* Is Current */}
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={aff.is_current}
                                onChange={(e) =>
                                  handleUpdateAffiliation(
                                    aff.id,
                                    "is_current",
                                    e.target.checked,
                                  )
                                }
                                className="w-4 h-4 text-sky-500 border-slate-300 rounded focus:ring-sky-500"
                              />
                              <span className="text-sm neu-text-primary">
                                Currently member
                              </span>
                            </label>

                            {/* Description */}
                            <div>
                              <label className="block text-sm font-medium neu-text-primary mb-2">
                                Description
                              </label>
                              <textarea
                                value={aff.description}
                                onChange={(e) =>
                                  handleUpdateAffiliation(
                                    aff.id,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                placeholder="Describe your activities and role..."
                                rows={3}
                                className="w-full px-3 py-2 rounded-lg neu-input text-sm resize-none"
                              />
                            </div>

                            {/* Delete Button */}
                            {!isProtected && (
                              <div className="pt-4 border-t border-slate-300">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPendingProfileDelete({
                                      type: "affiliation",
                                      id: aff.id,
                                    })
                                  }
                                  className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
                                >
                                  <Trash2 size={16} />
                                  Delete this entry
                                </button>
                              </div>
                            )}
                            {isProtected && (
                              <div className="pt-4 border-t border-slate-300">
                                <p className="text-xs text-amber-600 flex items-center gap-1">
                                  <Lock size={12} />
                                  This affiliation is protected and cannot be
                                  deleted
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          {/* Save Error Alert */}
          <AlertDialog
            isOpen={saveError !== null}
            type="error"
            title="Save Error"
            message={saveError || ""}
            onClose={() => setSaveError(null)}
          />
        </div>
      )}
    </Layout>
  );
};
