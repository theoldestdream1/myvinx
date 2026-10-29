package com.vinx.api;

import com.vinx.model.ContextEvent;
import com.vinx.service.ContextIngestionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/context")
public class ContextIngestionController {

    @Autowired
    private ContextIngestionService contextIngestionService;

    @PostMapping("/ingest")
    public ResponseEntity<String> ingestContext(@RequestBody List<ContextEvent> contextEvents) {
        try {
            contextIngestionService.ingestContextEvents(contextEvents);
            return new ResponseEntity<>("Context events ingested successfully", HttpStatus.CREATED);
        } catch (Exception e) {
            return new ResponseEntity<>("Failed to ingest context events", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}