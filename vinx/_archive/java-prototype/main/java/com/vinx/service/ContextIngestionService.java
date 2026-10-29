package com.vinx.service;

import com.vinx.model.ContextEvent;
import com.vinx.repository.ContextEventRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Date;
import java.util.List;

@Service
public class ContextIngestionService {

    @Autowired
    private ContextEventRepository contextEventRepository;

    @Transactional
    public void ingestContextEvents(List<ContextEvent> contextEvents) {
        for (ContextEvent event : contextEvents) {
            event.setTimestamp(new Date());
            event.setIsSynced(false);
        }
        contextEventRepository.saveAll(contextEvents);
    }

    @Transactional
    public void markEventsAsSynced(List<Long> ids) {
        contextEventRepository.markEventsAsSynced(ids);
    }

    @Transactional
    public void deleteSyncedEventsOlderThan(Date timestamp) {
        contextEventRepository.deleteSyncedEventsOlderThan(timestamp);
    }
}