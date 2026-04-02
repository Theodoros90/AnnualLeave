import { makeAutoObservable } from 'mobx'

export type AppPage = 'dashboard' | 'my-leave' | 'team-leave'
export type MyLeaveSection = 'apply' | 'requests' | 'balance' | 'history'
export type AdminSection = 'dashboard' | 'settings' | 'leave' | 'leave-types' | 'users' | 'departments'

class UiStore {
    isCreateDrawerOpen = false
    currentPage: AppPage = 'dashboard'
    myLeaveSection: MyLeaveSection = 'requests'
    adminSection: AdminSection = 'dashboard'

    constructor() {
        makeAutoObservable(this)
    }

    navigateToDashboard() {
        this.currentPage = 'dashboard'
        this.adminSection = 'dashboard'
    }

    navigateToAdminSection(section: AdminSection) {
        this.currentPage = 'dashboard'
        this.adminSection = section
    }

    navigateToMyLeave(section: MyLeaveSection = 'requests') {
        this.currentPage = 'my-leave'
        this.myLeaveSection = section
    }

    navigateToTeamLeave() {
        this.currentPage = 'team-leave'
    }

    setMyLeaveSection(section: MyLeaveSection) {
        this.myLeaveSection = section
    }

    openCreateDrawer() {
        this.isCreateDrawerOpen = true
    }

    closeCreateDrawer() {
        this.isCreateDrawerOpen = false
    }

    toggleCreateDrawer() {
        this.isCreateDrawerOpen = !this.isCreateDrawerOpen
    }

    resetAfterSignOut() {
        this.currentPage = 'dashboard'
        this.myLeaveSection = 'requests'
        this.adminSection = 'dashboard'
        this.isCreateDrawerOpen = false
    }
}

export default UiStore