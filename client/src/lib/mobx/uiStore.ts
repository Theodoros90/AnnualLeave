import { makeAutoObservable } from 'mobx'

export type AppPage = 'dashboard' | 'my-leave' | 'apply-leave' | 'team-leave' | 'timesheets' | 'team-timesheets'
export type MyLeaveSection = 'apply' | 'requests' | 'balance' | 'other' | 'history'
export type AdminSection = 'dashboard' | 'settings' | 'leave' | 'leave-types' | 'users' | 'departments' | 'projects'

class UiStore {
    isCreateDrawerOpen = false
    currentPage: AppPage = 'dashboard'
    myLeaveSection: MyLeaveSection = 'requests'
    adminSection: AdminSection = 'dashboard'

    constructor() { makeAutoObservable(this) }

    navigateToDashboard() { this.currentPage = 'dashboard'; this.adminSection = 'dashboard' }
    navigateToAdminSection(section: AdminSection) { this.currentPage = 'dashboard'; this.adminSection = section }
    navigateToMyLeave(section: MyLeaveSection = 'requests') { this.currentPage = 'my-leave'; this.myLeaveSection = section }
    navigateToApplyLeave() { this.currentPage = 'apply-leave' }
    navigateToTeamLeave() { this.currentPage = 'team-leave' }
    navigateToTimesheets() { this.currentPage = 'timesheets' }
    navigateToTeamTimesheets() { this.currentPage = 'team-timesheets' }
    setMyLeaveSection(section: MyLeaveSection) { this.myLeaveSection = section }
    openCreateDrawer() { this.isCreateDrawerOpen = true }
    closeCreateDrawer() { this.isCreateDrawerOpen = false }
    toggleCreateDrawer() { this.isCreateDrawerOpen = !this.isCreateDrawerOpen }
    resetAfterSignOut() { this.currentPage = 'dashboard'; this.myLeaveSection = 'requests'; this.adminSection = 'dashboard'; this.isCreateDrawerOpen = false }
}

export default UiStore
