package com.vinx.model;

import javax.persistence.*;
import java.util.Date;

@Entity
@Table(name = "context_events")
public class ContextEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "source_app", nullable = false)
    private String sourceApp;

    @Column(name = "capture_type", nullable = false)
    private String captureType;

    @Column(name = "raw_content", nullable = false)
    private String rawContent;

    @Column(name = "timestamp", nullable = false)
    private Date timestamp;

    @Column(name = "is_synced", nullable = false)
    private boolean isSynced;

    @Column(name = "hash_signature", nullable = false, unique = true)
    private String hashSignature;

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getSourceApp() {
        return sourceApp;
    }

    public void setSourceApp(String sourceApp) {
        this.sourceApp = sourceApp;
    }

    public String getCaptureType() {
        return captureType;
    }

    public void setCaptureType(String captureType) {
        this.captureType = captureType;
    }

    public String getRawContent() {
        return rawContent;
    }

    public void setRawContent(String rawContent) {
        this.rawContent = rawContent;
    }

    public Date getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(Date timestamp) {
        this.timestamp = timestamp;
    }

    public boolean isSynced() {
        return isSynced;
    }

    public void setSynced(boolean synced) {
        isSynced = synced;
    }

    public String getHashSignature() {
        return hashSignature;
    }

    public void setHashSignature(String hashSignature) {
        this.hashSignature = hashSignature;
    }
}