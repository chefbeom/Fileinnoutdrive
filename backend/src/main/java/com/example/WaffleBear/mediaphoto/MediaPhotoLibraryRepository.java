package com.example.WaffleBear.mediaphoto;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MediaPhotoLibraryRepository extends JpaRepository<MediaPhotoLibrary, Long> {

    Optional<MediaPhotoLibrary> findByUser_Idx(Long userIdx);

    void deleteAllByUser_Idx(Long userIdx);
}
