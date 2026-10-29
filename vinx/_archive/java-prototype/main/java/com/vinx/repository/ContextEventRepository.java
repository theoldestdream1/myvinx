package com.vinx.repository;

import com.vinx.model.ContextEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public interface ContextEventRepository extends JpaRepository<ContextEvent, Long> {

    @Query("SELECT ce FROM ContextEvent ce WHERE ce.isSynced = false ORDER BY ce.timestamp ASC")
    List<ContextEvent> findUnsyncedEvents();

    @Modifying
    @Transactional
    @Query("UPDATE ContextEvent ce SET ce.isSynced = true WHERE ce.id IN :ids")
    void markEventsAsSynced(@Param("ids") List<Long> ids);

    @Modifying
    @Transactional
    @Query("DELETE FROM ContextEvent ce WHERE ce.isSynced = true AND ce.timestamp < :timestamp")
    void deleteSyncedEventsOlderThan(@Param("timestamp") Date timestamp);
}