import { mount } from "@vue/test-utils"
import { describe, expect, it } from "vitest"

import AdminVaultEncryptionSection from "./AdminVaultEncryptionSection.vue"

describe("AdminVaultEncryptionSection", () => {
  it("renders summary cards, per-user table, running job progress, and emits migration actions", async () => {
    const wrapper = mount(AdminVaultEncryptionSection, {
      props: {
        status: {
          totalVaultFiles: 10,
          encryptedVaultFiles: 4,
          plaintextVaultFiles: 6,
          plaintextBytes: 4096,
          encryptedBytes: 2048,
          users: [
            {
              userIdx: 7,
              email: "alice@example.com",
              name: "Alice",
              totalVaultFiles: 6,
              encryptedVaultFiles: 0,
              plaintextVaultFiles: 6,
              plaintextBytes: 4096,
              encryptedBytes: 0,
            },
            {
              userIdx: 8,
              email: "bob@example.com",
              name: "Bob",
              totalVaultFiles: 4,
              encryptedVaultFiles: 4,
              plaintextVaultFiles: 0,
              plaintextBytes: 0,
              encryptedBytes: 2048,
            },
          ],
          job: {
            running: false,
            jobId: null,
            scannedCount: 0,
            processedCount: 0,
            migratedCount: 0,
            skippedCount: 0,
            failedCount: 0,
            recentFailures: [],
          },
        },
      },
    })

    expect(wrapper.text()).toContain("10개")
    expect(wrapper.text()).toContain("4개 (40.00%)")
    expect(wrapper.text()).toContain("6개")
    expect(wrapper.text()).toContain("alice@example.com")
    expect(wrapper.text()).toContain("bob@example.com")
    expect(wrapper.text()).toContain("대기 중")
    expect(wrapper.text()).toContain("암호화 완료")

    await wrapper.find(".admin-vault-btn").trigger("click")
    expect(wrapper.emitted("start-migration")[0]).toEqual([null])

    const userButtons = wrapper.findAll("tbody button")
    expect(userButtons[0].attributes("disabled")).toBeUndefined()
    expect(userButtons[1].attributes("disabled")).toBeDefined()
    await userButtons[0].trigger("click")
    expect(wrapper.emitted("start-migration")[1]).toEqual([7])

    await wrapper.find(".admin-page__refresh").trigger("click")
    expect(wrapper.emitted("refresh")).toHaveLength(1)
  })

  it("displays live progress bar and recent failures when a job runs", () => {
    const wrapper = mount(AdminVaultEncryptionSection, {
      props: {
        status: {
          totalVaultFiles: 10,
          encryptedVaultFiles: 5,
          plaintextVaultFiles: 5,
          plaintextBytes: 1024,
          encryptedBytes: 1024,
          users: [],
          job: {
            running: true,
            jobId: "job-1",
            scannedCount: 10,
            processedCount: 5,
            migratedCount: 4,
            skippedCount: 0,
            failedCount: 1,
            currentFileName: "secret-clip.mp4",
            recentFailures: [
              { fileIdx: 99, userIdx: 7, fileName: "broken.png", reason: "암호화 또는 스토리지 처리 실패" },
            ],
          },
        },
      },
    })

    expect(wrapper.text()).toContain("진행 중 (5 / 10개)")
    expect(wrapper.text()).toContain("secret-clip.mp4")
    expect(wrapper.text()).toContain("50%")
    expect(wrapper.text()).toContain("broken.png")
    expect(wrapper.find(".admin-vault-btn").attributes("disabled")).toBeDefined()
  })
})
